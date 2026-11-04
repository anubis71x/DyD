import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import { ConflictError, NotFoundError } from "@/lib/save/service";
import { ImportError } from "@/lib/save/portable";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requireUser(): string {
  const { userId } = auth();
  if (!userId) throw new HttpError(401, "Sign in to continue.");
  return userId;
}

/** Wrap a route handler: map known errors to JSON responses, log the rest. */
export function handle<A extends unknown[]>(name: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
      if (err instanceof ConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
      if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: 400 });
      console.error(`[${name}]`, err);
      return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
    }
  };
}
