/*
 * Derives react-hook-form `defaultValues` from a Zod object schema.
 *
 * Originally based on https://github.com/colinhacks/zod/discussions/1953, which
 * had to unwrap `ZodEffects`. Zod v4 removed that wrapper entirely — `.refine()`
 * now returns the same schema type — so a refined object is still a `ZodObject`
 * and needs no special case. `ZodDefault`'s `defaultValue` is also a plain value
 * in v4 rather than a getter function.
 */
import { z } from "zod";

const getDefaultValue = (field: z.ZodType): unknown => {
  if (field instanceof z.ZodDefault) {
    return field.def.defaultValue;
  }
  if (field instanceof z.ZodArray) {
    return [];
  }
  if (field instanceof z.ZodString) {
    return "";
  }
  if (field instanceof z.ZodObject) {
    return getSchemaDefaults(field);
  }
  // Unwrap optional/nullable//etc. and fall through to their inner type.
  if ("innerType" in field.def) {
    return getDefaultValue(field.def.innerType as z.ZodType);
  }
  return undefined;
};

export const getSchemaDefaults = <T extends z.ZodObject>(schema: T): Partial<z.infer<T>> => {
  return Object.fromEntries(
    Object.entries(schema.shape).map(([key, value]) => [key, getDefaultValue(value as z.ZodType)])
  ) as Partial<z.infer<T>>;
};
