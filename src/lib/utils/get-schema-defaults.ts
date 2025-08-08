/*
 * @see: https://github.com/colinhacks/zod/discussions/1953#discussioncomment-5695528
 */
import { z } from "zod";
export const getSchemaDefaults = <T extends z.ZodTypeAny>(
	schema: z.AnyZodObject | z.ZodType<any, any, any>
): z.infer<T> => {
	// Check if it's a ZodEffect (using type guard)
	if ('innerType' in schema && typeof (schema as any).innerType === 'function') {
		const innerType = (schema as any).innerType();
		// Check if it's a recursive ZodEffect
		if ('innerType' in innerType && typeof innerType.innerType === 'function') {
			return getSchemaDefaults(innerType);
		}
		// return schema inner shape as a fresh zodObject
		if (innerType.shape) {
			return getSchemaDefaults(z.ZodObject.create(innerType.shape));
		}
	}

	function getDefaultValue(schema: z.ZodTypeAny): unknown {
		if (schema instanceof z.ZodDefault) {
			return schema._def.defaultValue();
		}
		// return an empty array if it is
		if (schema instanceof z.ZodArray) {
			return [];
		}
		// return an empty string if it is
		if (schema instanceof z.ZodString) {
			return "";
		}
		// return an content of object recursivly
		if (schema instanceof z.ZodObject) {
			return getSchemaDefaults(schema);
		}

		if (!("innerType" in schema._def)) {
			return undefined;
		}
		return getDefaultValue(schema._def.innerType);
	}

	return Object.fromEntries(
		Object.entries(schema.shape).map(([key, value]) => {
			return [key, getDefaultValue(value as z.ZodTypeAny)];
		})
	);
};
