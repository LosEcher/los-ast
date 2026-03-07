/**
 * ID 生成器
 */
const PREFIX_MAP = {
    inc: 'inc', // incident
    hyp: 'hyp', // hypothesis
    act: 'act', // action
    rec: 'rec', // recipe
    cfg: 'cfg', // config
    evd: 'evd', // evidence
    fct: 'fct', // fact
};
/**
 * 生成唯一 ID
 * @param type - ID 类型前缀
 * @returns 生成的 ID
 */
export function generateId(type) {
    const prefix = PREFIX_MAP[type] || 'unk';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${random}`;
}
/**
 * 生成 UUID v4
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
//# sourceMappingURL=id-generator.js.map