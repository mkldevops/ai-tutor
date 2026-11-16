import { getRouteApi } from "@tanstack/react-router";
import type { CompetencyStatus } from "#/domain/types";
import type { getProgressFn } from "#/server/functions";

export type Progress = Awaited<ReturnType<typeof getProgressFn>>;
export type Objective = Progress["objectives"][number];

export const DONE: CompetencyStatus[] = ["secure", "mastered"];

const studentRoute = getRouteApi("/_authed/students/$studentId");

export const useProgress = (): Progress => studentRoute.useLoaderData();
