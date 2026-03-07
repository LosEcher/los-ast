/**
 * ID 生成器
 */
declare const PREFIX_MAP: Record<string, string>;
/**
 * 生成唯一 ID
 * @param type - ID 类型前缀
 * @returns 生成的 ID
 */
export declare function generateId(type: keyof typeof PREFIX_MAP): string;
/**
 * 生成 UUID v4
 */
export declare function generateUUID(): string;
export {};
//# sourceMappingURL=id-generator.d.ts.map