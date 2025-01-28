import type { ActionFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import { InitializeTriggerBodySchema } from "@trigger.dev/core";
import { z } from "zod";
import { authenticateApiRequest } from "~/services/apiAuth.server";
import { logger } from "~/services/logger.server";
import { InitializeTriggerService } from "~/services/triggers/initializeTrigger.server";

const ParamsSchema = z.object({
  endpointSlug: z.string(),
  id: z.string(),
});

export async function action({ request, params }: ActionFunctionArgs) {
  logger.info("Initializing trigger", { url: request.url });

  // Ensure this is a POST request
  if (request.method.toUpperCase() !== "POST") {
    return { status: 405, body: "Method Not Allowed" };
  }

  const parsedParams = ParamsSchema.safeParse(params);

  if (!parsedParams.success) {
    logger.info("Invalid params", { params });

    return json({ error: "Invalid params" }, { status: 400 });
  }

  // Next authenticate the request
  const authenticationResult = await authenticateApiRequest(request);

  if (!authenticationResult) {
    logger.info("Invalid or missing api key", { url: request.url });
    return json({ error: "Invalid or Missing API key" }, { status: 401 });
  }

  const authenticatedEnv = authenticationResult.environment;

  // Now parse the request body
  const anyBody = await request.json();

  const body = InitializeTriggerBodySchema.safeParse(anyBody);

  if (!body.success) {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const service = new InitializeTriggerService();

  try {
    const registration = await service.call({
      environment: authenticatedEnv,
      payload: body.data,
      endpointSlug: parsedParams.data.endpointSlug,
      id: parsedParams.data.id,
    });

    return json(registration);
  } catch (error) {
    if (error instanceof Error) {
      logger.error("Error initializing trigger", {
        url: request.url,
        error: error.message,
      });

      return json({ error: error.message }, { status: 400 });
    }

    return json({ error: "Something went wrong" }, { status: 500 });
  }
}
