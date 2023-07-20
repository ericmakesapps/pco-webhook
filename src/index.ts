import express from "express"

import daysBetween from "@ericbf/helpers/daysBetween"
import debounce from "@ericbf/helpers/debounce"
import { Datum, ParsedRequest } from "./types/Requests"
import { Plan } from "./types/Plan"
import { Schedule } from "./types/Schedule"

const app = express()
const api = "https://api.planningcenteronline.com/services/v2"

const plans: Record<string, [Date, Promise<Plan | undefined>]> = {}

const getPlan = async (
	planId: string,
	personId: string,
	username: string,
	password: string
) => {
	let data = plans[planId]

	if (!data || daysBetween(data[0], new Date()) >= 1) {
		data = plans[planId] = [
			new Date(),
			Promise.all([
				fetch(`${api}/plans/${planId}`, {
					headers: {
						Authorization:
							"Basic " +
							Buffer.from(username + ":" + password).toString("base64")
					}
				})
					.then((r): Promise<Plan> => r.json())
					.catch(() => undefined),
				fetch(`${api}/people/${personId}/schedules?where[plan_id]=${planId}`)
					.then((r): Promise<Schedule | undefined> => r.json())
					.catch(() => undefined)
			]).then(([plan, schedule]) => {
				if (!plan || !schedule?.data.length) {
					delete plans[planId]

					return undefined
				}

				return plan
			})
		]
	}

	return data[1]
}

/**
 * Define the contents of the notification.
 *
 * **`<value1>`**  \
 * `<value2>`  \
 * *Tapping opens `value3` as a URL*
 */
type NotificationPayload = {
	/** The notification title */
	value1?: string
	/** The notification content */
	value2?: string
	/** The URL to open on tap */
	value3?: string
}

const sendNotification = debounce(
	async (json: NotificationPayload, iftttEvent: string, iftttKey: string) => {
		return fetch(
			`https://maker.ifttt.com/trigger/${iftttEvent}/with/key/${iftttKey}`,
			{
				method: "post",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json"
				},
				body: JSON.stringify(json)
			}
		)
	},
	1000 * 60,
	true
)

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
				payload: JSON.parse(data.attributes.payload!)
			}
		})

		next()
	},
	async (req: ParsedRequest, res) => {
		try {
			const iftttEvent = req.query["ifttt-event"]
			const iftttKey = req.query["ifttt-key"]
			const username = req.query["pco-token-username"]
			const password = req.query["pco-token-password"]
			const personId = req.query["pco-person-id"]

			if (!iftttEvent || !iftttKey || !username || !password || !personId) {
				res.status(400)

				let message = ["Missing parameter(s)."]

				if (!iftttEvent) {
					message.push("Pass the IFTTT event as `ifttt-event`.")
				}

				if (!iftttKey) {
					message.push("Pass the IFTTT key as `ifttt-key`.")
				}

				if (!username) {
					message.push("Pass the PCO token username as `pco-token-username`.")
				}

				if (!password) {
					message.push("Pass the PCO token password as `pco-token-password`.")
				}

				if (!personId) {
					message.push("Pass the PCO person ID as `pco-person-id`.")
				}

				res.send(message.join(" "))

				return
			}

			const json: NotificationPayload = {
				value1: "Planning Center Updated"
			}

			const planId = req.body[0].payload.data.relationships.plan.data.id

			const plan = await getPlan(planId, personId, username, password)

			console.log("Plan:", plan)

			if (plan) {
				json.value2 = `${plan.data.attributes.series_title} ${plan.data.attributes.title} was updated. Check it out!`
				json.value3 = plan.data.attributes.planning_center_url

				const post = await sendNotification(json, iftttEvent, iftttKey)

				res.status(post.status)
				res.send(`Success:\n\n${JSON.stringify(json, undefined, 2)}`)
			} else {
				res.send(`Successfully processed request.`)
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
