# PCO Webhook

Planning Center Online doesn’t notify you when a service you are scheduled for is updated. That’s a problem! This simple webhook allows you to receive an IFTTT push notification whenever an event you subscribe to is triggered. You will need to set up a webhook on [planning center's api website](http://api.planningcenteronline.com). Set the appropriate events, set the URL to wherever you are running this app (the URL), and pass the appropriate params. You'll need to set up a "Send a rich notification from the IFTTT app" triggered by a "Receive a web request" trigger in IFTTT. Then enjoy being notified on PCO service updates!

## Params

-   `ifttt-event`: Your event name in your IFTTT account.
-   `ifttt-key`: Your IFTTT key.
-   `pco-token-username`: Your token username for the PCO API, so you don't include your actual username.
-   `pco-token-password`: Your token password for the PCO API.
-   `pco-person-id`: The ID of the person whose schedule you want notifications about. Usually this is your own person ID. You can find this from the PCO API: `https://api.planningcenteronline.com/services/v2/people?where[name_like]=John Doe` where you put your name instead of `John Doe`.
