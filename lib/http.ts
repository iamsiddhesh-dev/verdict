import { NextResponse } from "next/server";
import { UnauthenticatedError } from "@/lib/auth";
import { CapacityError } from "@/lib/llm";

export function json<T>(data: T, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Route handler wrapper: turns known errors into honest responses and hides the rest. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof UnauthenticatedError) return errorResponse("Your session expired. Reload the page.", 401);
      if (err instanceof CapacityError) return errorResponse(err.message, 503);
      console.error("[api]", err);
      return errorResponse("Something went wrong on our side. Try again.", 500);
    }
  };
}

export const notFound = () => errorResponse("Not found", 404);
