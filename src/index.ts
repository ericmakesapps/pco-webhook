import got from "got"
import express from "express"

/*
 * Auth should be an object exported with property username and password. These will be your personal auth token from the PCO API.
 */
import { auth } from "./auth.js"

import { Datum, ParsedRequest } from "./types/Requests.js"
import { ServiceTypes } from "./types/ServiceTypes.js"
import { Plans, Plan } from "./types/Plans.js"

const app = express()

const api = "https://api.planningcenteronline.com/services/v2"

const plans: Record<string, Plan> = {}

// Populate the plans object
async function populatePlans() {
	const previous = Object.keys(plans)

	const serviceTypes = await got.get(`${api}/service_types`, auth).json<ServiceTypes>()

	let promises: Promise<any>[] = []

	for (const serviceType of serviceTypes.data) {
		promises.push(
			got
				.get(`${api}/service_types/${serviceType.id}/plans`, auth)
				.json<Plans>()
				.then((planDatas) => {
					for (const plan of planDatas.data) {
						plans[plan.id] = plan

						const index = previous.indexOf(plan.id)

						if (index >= 0) {
							previous.splice(index, 1)
						}
					}
				})
		)
	}

	await Promise.all(promises)

	// Remove any plans that no longer exist
	for (const id of previous) {
		delete plans[id]
	}
}

populatePlans()

async function getPlanIfExists(id: string) {
	const plan = plans[id]

	if (plan) {
		return got
			.get(
				`${api}/service_types/${plan.relationships.service_type.data?.id}/plans/${id}`,
				auth
			)
			.json<Plan>()
			.then(() => plan)
			.catch(() => undefined)
	}

	if (!plan) {
		await populatePlans()

		return plans[id]
	}
}

app.use(express.json())

app.get("/", (_, res) => {
	res.send("I’m alive!\n")
})

app.post(
	"/",
	(req, _, next) => {
		req.body = req.body.data.map((data: Datum) => {
			return {
				...data.attributes,
				payload: JSON.parse(data.attributes.payload)
			}
		})

		next()
	},
	async (req: ParsedRequest, res) => {
		try {
			const iftttEvent = req.query["ifttt-event"]
			const iftttKey = req.query["ifttt-key"]

			if (!iftttEvent || !iftttKey) {
				res.status(400)

				if (!iftttEvent && !iftttKey) {
					res.send(
						"The IFTTT event and key are required. Pass them in the query string under `ifttt-event` and `ifttt-key`."
					)
				} else if (!iftttEvent) {
					res.send(
						"The IFTTT event is required. Pass it in the query string under `ifttt-event`."
					)
				} else {
					res.send(
						"The IFTTT key is required. Pass it in the query string under `ifttt-key`."
					)
				}
			} else {
				const payload = req.body[0].payload

				const id = [
					payload.meta.parent,
					payload.data,
					payload.data.relationships.plan.data
				].find((entity) => entity?.type === "Plan")?.id

				/**
				 * Define the parameters of the notification.
				 *
				 * **`<value1>`**  \
				 * `<value2>`  \
				 * *Tapping opens `value3` as a URL*
				 */
				const json: {
					/** The notification title */
					value1?: string
					/** The notification content */
					value2?: string
					/** The URL to open on tap */
					value3?: string
				} = {
					value1: "Planning Center Updated"
				}

				const plan = id && (await getPlanIfExists(id))

				if (plan) {
					json.value2 = `${plan.attributes.series_title} ${plan.attributes.title} was updated. Check it out!`
					json.value3 = plan.attributes.planning_center_url

					const post = await got.post(
						`https://maker.ifttt.com/trigger/${iftttEvent}/with/key/${iftttKey}`,
						{ json }
					)

					res.status(post.statusCode)
					res.send(`Success: ${post.body}`)
				} else {
					res.send(`Successfully processed request.`)
				}
			}
		} catch (err: any) {
			res.status(500)
			res.send(err.description || err.text || err.message || JSON.stringify(err))
		}
	}
)

app.listen(7777, "127.0.0.1", () => {
	console.log("Listening on port 7777")
})
