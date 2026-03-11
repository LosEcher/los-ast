import type { ScanLimits } from '../types/index.js';
interface ConfigValidationResult {
    valid: boolean;
    errors: string[];
}
export declare const NODE_ENV: "development" | "production" | "test";
export declare const IS_PRODUCTION: boolean;
export declare const PORT: number;
export declare const SCAN_LIMITS: ScanLimits;
export declare const SCOPE_CONFIG: {
    requireFullScope: boolean;
    allowedModes: {
        production: readonly ["service"];
        development: readonly ["local", "service"];
    };
};
export declare const JWT_CONFIG: {
    secret: string | null;
    enforceJWT: boolean;
};
export declare const DEV_ALLOW_UNVERIFIED_IDENTITY: boolean;
export declare const EVIDENCE_CONFIG: {
    signingKey: string | null;
    enableSignatures: boolean;
};
export declare const PARSER_CONFIG: {
    enableOpenApiNativeParser: boolean;
    enableSchemaNativeParser: boolean;
};
export declare const ROUTE_CONFIG: {
    enableExperimental: boolean;
    enableInternal: boolean;
    enableVpsAgentWeb: boolean;
    prefixes: {
        core: string;
        experimental: string;
        internal: string;
        vpsAgentWeb: string;
    };
};
export declare function validateConfig(): ConfigValidationResult;
export declare function logStartupConfig(): void;
export {};
//# sourceMappingURL=index.d.ts.map