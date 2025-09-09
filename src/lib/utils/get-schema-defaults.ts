/*
 * @see: https://github.com/colinhacks/zod/discussions/1953#discussioncomment-5695528
 */
import { z } from "zod";

export const getSchemaDefaults = <T extends z.ZodTypeAny>(
	schema: z.ZodTypeAny
): z.infer<T> => {
	function getDefaultValue(inner: z.ZodTypeAny): unknown {
		if (inner instanceof z.ZodDefault) {
			return (inner as any)._def.defaultValue();
		}
		if (inner instanceof z.ZodArray) {
			return [];
		}
		if (inner instanceof z.ZodString) {
			return "";
		}
		if (inner instanceof z.ZodObject) {
			return getSchemaDefaults(inner);
		}
		if ((inner as any)._def && (inner as any)._def.innerType) {
			return getDefaultValue((inner as any)._def.innerType);
		}
		return undefined;
	}

	if (schema instanceof z.ZodObject) {
		const shape = (schema as any).shape;
		return Object.fromEntries(
			Object.entries(shape).map(([key, value]) => [key, getDefaultValue(value as z.ZodTypeAny)])
		) as any;
	}

	return {} as any;
};
