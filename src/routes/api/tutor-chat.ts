import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tutor-chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { handleTutorChat } = await import("#/server/tutor-chat-http");
				const { requireActor } = await import("#/server/session");
				const { getServerContext } = await import("#/server/context");
				const { createTutorStreamer } = await import("#/ai/tutor-agent");
				const { config, store, index, embedder } = getServerContext();
				return handleTutorChat(request, {
					requireActor,
					deps: {
						store,
						dailyCallsPerFamily: config.AI_DAILY_CALLS_PER_FAMILY,
						retentionDays: config.TUTOR_MESSAGE_RETENTION_DAYS,
						createStreamer: (scope) => createTutorStreamer(config, store, scope, { index, embedder }),
					},
				});
			},
		},
	},
});
