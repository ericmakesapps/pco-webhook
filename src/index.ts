import express from "express"

import daysBetween from "fast-ts-helpers/daysBetween"
import debounce from "fast-ts-helpers/debounce"
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
					.catch((e) => {
						console.error(e)

						return undefined
					}),
				fetch(`${api}/people/${personId}/schedules?where[plan_id]=${planId}`, {
					headers: {
						Authorization:
							"Basic " +
							Buffer.from(username + ":" + password).toString("base64")
					}
				})
					.then((r): Promise<Schedule | undefined> => r.json())
					.catch((e) => {
						console.error(e)

						return undefined
					})
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
	/** The ID of the trigger in PushMe. */
	triggerId: string
	/** The notification title. */
	title?: string
	/** The notification text content. */
	text?: string
	/** The notification URL. */
	url?: string
}

const sendNotification = debounce(
	async (json: NotificationPayload) => {
		if (!json.text) {
			console.log("No text provided for notification. Nothing to do.")

			return
		}

		return fetch("https://pushme.win/trigger", {
			method: "post",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json"
			},
			body: JSON.stringify(json)
		})
	},
	// Let's wait for four minutes
	1000 * 60 * 4,
	// Wait for changes to settle before sending the notification
	false
)

app.get("/", (_, res) => {
	res.end("I’m alive!\n")
})

app.use(express.json())

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
			const triggerId = req.query["trigger-id"]
			const username = req.query["pco-token-username"]
			const password = req.query["pco-token-password"]
			const personId = req.query["pco-person-id"]

			if (!triggerId || !username || !password || !personId) {
				res.status(400)

				let message = ["Missing parameter(s)."]

				if (!triggerId) {
					message.push("Pass the PushMe trigger ID as `trigger-id`.")
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
				triggerId,
				title: "Planning Center Update"
			}

			const plan = await getPlan(
				req.body[0].payload.meta.parent.id,
				personId,
				username,
				password
			)

			console.log("Plan:", plan)

			if (plan) {
				json.text = `${plan.data.attributes.series_title} ${plan.data.attributes.title} was updated. Check it out!`
				json.url = plan.data.attributes.planning_center_url

				await sendNotification(json)

				res.status(200)
				res.send(
					`Successfully queued notification:\n\n${JSON.stringify(
						json,
						undefined,
						2
					)}`
				)
			} else {
				res.send(`Successfully processed request.`)
			}
		} catch (err: any) {
			res.status(500)
			res.send(err.description || err.text || err.message || JSON.stringify(err))
		}
	}
)

const port = parseInt(process.env.PORT || "", 10) || 3000

app.listen(port, "0.0.0.0", () => {
	console.log(`Listening on port ${port}`)
})
