import got from "got"
import express from "express"

const app = express()

app.use(express.json())

app.get("/", (_, res) => {
	res.send("I’m alive!\n")
})

app.post("/", async (req, res) => {
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
			const data = JSON.parse(req.body.data[0].attributes.payload).data.attributes

			const url = data.planning_center_url
			const series = data.series_title
			const title = data.title

			const post = await got.post(
				`https://maker.ifttt.com/trigger/${iftttEvent}/with/key/${iftttKey}`,
				{ json: { value1: series, value2: title, value3: url } }
			)

			res.status(post.statusCode)
			res.send(`Success: ${post.body}`)
		}
	} catch (err: any) {
		res.status(500)
		res.send(err.description || err.text || err.message || JSON.stringify(err))
	}
})

app.listen(7777, "127.0.0.1", () => {
	console.log("Listening on port 7777")
})
