import { twiml } from "twilio";

export function createMessagingResponse() {
    return new twiml.MessagingResponse();
}
