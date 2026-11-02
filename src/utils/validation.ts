import { z } from "zod";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * Validate input against a Zod schema. Returns the parsed output type,
 * so fields with .default() are typed as always present.
 */
export function validateInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join(", ");
    throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${issues}`);
  }
  return result.data;
}
