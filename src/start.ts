import { createMiddleware, createStart } from "@tanstack/react-start";
import { bodyLimit, checkRequestSize } from "./server/request-size";

const requestSize = createMiddleware().server(({ request, handlerType, next }) => {
	return checkRequestSize(request, bodyLimit(handlerType)) ?? next();
});

export const startInstance = createStart(() => ({ requestMiddleware: [requestSize] }));
