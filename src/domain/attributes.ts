export type AttributeValue = string | number | boolean | string[] | number[] | boolean[];
export type Attributes = Record<string, AttributeValue | undefined>;

export function compactAttributes(attributes: Attributes): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function errorAttributes(error: unknown): Record<string, AttributeValue> {
  if (error instanceof Error) {
    return compactAttributes({
      "exception.type": error.name || "Error",
      "exception.message": error.message,
      "exception.stacktrace": error.stack,
    });
  }
  return {
    "exception.type": typeof error,
    "exception.message": String(error),
  };
}
