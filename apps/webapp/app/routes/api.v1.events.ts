import type { ActionFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import { SendEventBodySchema } from "@trigger.dev/core";
import { generateErrorMessage } from "zod-error";
import { authenticateApiRequest } from "~/services/apiAuth.server";
import { IngestSendEvent } from "~/services/events/ingestSendEvent.server";
import { eventRecordToApiJson } from "~/api.server";

export async function action({ request }: ActionFunctionArgs) {
  // Ensure this is a POST request
  if (request.method.toUpperCase() !== "POST") {
    return { status: 405, body: "Method Not Allowed" };
  }

  // Next authenticate the request
  const authenticationResult = await authenticateApiRequest(request);

  if (!authenticationResult) {
    return json({ error: "Invalid or Missing API key" }, { status: 401 });
  }

  const authenticatedEnv = authenticationResult.environment;

  // Now parse the request body
  const anyBody = await request.json();

  const body = SendEventBodySchema.safeParse(anyBody);

  if (!body.success) {
    return json({ message: generateErrorMessage(body.error.issues) }, { status: 422 });
  }

  const service = new IngestSendEvent();

  const event = await service.call(authenticatedEnv, body.data.event, body.data.options);

  if (!event) {
    return json({ error: "Failed to create event" }, { status: 500 });
  }

  return json(eventRecordToApiJson(event));
}
