export declare const scanResponseDataSchema: {
    type: string;
    properties: {
        filesScanned: {
            type: string;
        };
        findings: {
            type: string;
            items: {
                type: string;
                properties: {
                    tool: {
                        type: string;
                    };
                    version: {
                        type: string;
                    };
                    timestamp: {
                        type: string;
                    };
                    project: {
                        type: string;
                    };
                    ruleFile: {
                        anyOf: {
                            type: string;
                        }[];
                    };
                    ruleId: {
                        type: string;
                    };
                    findingSource: {
                        type: string;
                        enum: string[];
                    };
                    governanceDomain: {
                        anyOf: ({
                            type: string;
                            items: {
                                type: string;
                            };
                        } | {
                            type: string;
                            items?: undefined;
                        })[];
                    };
                    impactHint: {
                        anyOf: ({
                            type: string;
                            enum: string[];
                        } | {
                            type: string;
                            enum?: undefined;
                        })[];
                    };
                    severity: {
                        type: string;
                        enum: string[];
                    };
                    message: {
                        type: string;
                    };
                    file: {
                        type: string;
                    };
                    language: {
                        type: string;
                    };
                    range: {
                        type: string;
                        properties: {
                            start: {
                                type: string;
                                properties: {
                                    line: {
                                        type: string;
                                    };
                                    column: {
                                        type: string;
                                    };
                                    index: {
                                        type: string;
                                    };
                                };
                            };
                            end: {
                                type: string;
                                properties: {
                                    line: {
                                        type: string;
                                    };
                                    column: {
                                        type: string;
                                    };
                                    index: {
                                        type: string;
                                    };
                                };
                            };
                        };
                    };
                    excerpt: {
                        type: string;
                    };
                    hasFix: {
                        type: string;
                    };
                    proposedReplacement: {
                        anyOf: {
                            type: string;
                        }[];
                    };
                    diff: {
                        anyOf: {
                            type: string;
                        }[];
                    };
                    applied: {
                        type: string;
                    };
                    fingerprint: {
                        type: string;
                    };
                };
                additionalProperties: boolean;
            };
        };
        parseCache: {
            type: string;
            properties: {
                hits: {
                    type: string;
                };
                misses: {
                    type: string;
                };
                entries: {
                    type: string;
                };
                maxEntries: {
                    type: string;
                };
            };
        };
        parseFailures: {
            type: string;
            properties: {
                count: {
                    type: string;
                };
                sampleLimit: {
                    type: string;
                };
                truncated: {
                    type: string;
                };
                byLanguage: {
                    type: string;
                    additionalProperties: {
                        type: string;
                    };
                };
                samples: {
                    type: string;
                    items: {
                        type: string;
                        properties: {
                            file: {
                                type: string;
                            };
                            language: {
                                type: string;
                            };
                            error: {
                                type: string;
                            };
                        };
                    };
                };
            };
        };
        scanTelemetry: {
            type: string;
            properties: {
                durationMs: {
                    type: string;
                };
                mode: {
                    type: string;
                    enum: string[];
                };
                explicitRulePatterns: {
                    type: string;
                };
                loadedRules: {
                    type: string;
                };
                estimatedFiles: {
                    type: string;
                };
                nativeInputs: {
                    type: string;
                    properties: {
                        openApiDocuments: {
                            type: string;
                        };
                        openApiComparisons: {
                            type: string;
                        };
                        schemaDocuments: {
                            type: string;
                        };
                        schemaComparisons: {
                            type: string;
                        };
                        contractArtifacts: {
                            type: string;
                        };
                        schemaArtifacts: {
                            type: string;
                        };
                    };
                };
            };
        };
    };
};
export declare const scanResponseSchema: {
    type: string;
    properties: {
        data: {
            type: string;
            properties: {
                filesScanned: {
                    type: string;
                };
                findings: {
                    type: string;
                    items: {
                        type: string;
                        properties: {
                            tool: {
                                type: string;
                            };
                            version: {
                                type: string;
                            };
                            timestamp: {
                                type: string;
                            };
                            project: {
                                type: string;
                            };
                            ruleFile: {
                                anyOf: {
                                    type: string;
                                }[];
                            };
                            ruleId: {
                                type: string;
                            };
                            findingSource: {
                                type: string;
                                enum: string[];
                            };
                            governanceDomain: {
                                anyOf: ({
                                    type: string;
                                    items: {
                                        type: string;
                                    };
                                } | {
                                    type: string;
                                    items?: undefined;
                                })[];
                            };
                            impactHint: {
                                anyOf: ({
                                    type: string;
                                    enum: string[];
                                } | {
                                    type: string;
                                    enum?: undefined;
                                })[];
                            };
                            severity: {
                                type: string;
                                enum: string[];
                            };
                            message: {
                                type: string;
                            };
                            file: {
                                type: string;
                            };
                            language: {
                                type: string;
                            };
                            range: {
                                type: string;
                                properties: {
                                    start: {
                                        type: string;
                                        properties: {
                                            line: {
                                                type: string;
                                            };
                                            column: {
                                                type: string;
                                            };
                                            index: {
                                                type: string;
                                            };
                                        };
                                    };
                                    end: {
                                        type: string;
                                        properties: {
                                            line: {
                                                type: string;
                                            };
                                            column: {
                                                type: string;
                                            };
                                            index: {
                                                type: string;
                                            };
                                        };
                                    };
                                };
                            };
                            excerpt: {
                                type: string;
                            };
                            hasFix: {
                                type: string;
                            };
                            proposedReplacement: {
                                anyOf: {
                                    type: string;
                                }[];
                            };
                            diff: {
                                anyOf: {
                                    type: string;
                                }[];
                            };
                            applied: {
                                type: string;
                            };
                            fingerprint: {
                                type: string;
                            };
                        };
                        additionalProperties: boolean;
                    };
                };
                parseCache: {
                    type: string;
                    properties: {
                        hits: {
                            type: string;
                        };
                        misses: {
                            type: string;
                        };
                        entries: {
                            type: string;
                        };
                        maxEntries: {
                            type: string;
                        };
                    };
                };
                parseFailures: {
                    type: string;
                    properties: {
                        count: {
                            type: string;
                        };
                        sampleLimit: {
                            type: string;
                        };
                        truncated: {
                            type: string;
                        };
                        byLanguage: {
                            type: string;
                            additionalProperties: {
                                type: string;
                            };
                        };
                        samples: {
                            type: string;
                            items: {
                                type: string;
                                properties: {
                                    file: {
                                        type: string;
                                    };
                                    language: {
                                        type: string;
                                    };
                                    error: {
                                        type: string;
                                    };
                                };
                            };
                        };
                    };
                };
                scanTelemetry: {
                    type: string;
                    properties: {
                        durationMs: {
                            type: string;
                        };
                        mode: {
                            type: string;
                            enum: string[];
                        };
                        explicitRulePatterns: {
                            type: string;
                        };
                        loadedRules: {
                            type: string;
                        };
                        estimatedFiles: {
                            type: string;
                        };
                        nativeInputs: {
                            type: string;
                            properties: {
                                openApiDocuments: {
                                    type: string;
                                };
                                openApiComparisons: {
                                    type: string;
                                };
                                schemaDocuments: {
                                    type: string;
                                };
                                schemaComparisons: {
                                    type: string;
                                };
                                contractArtifacts: {
                                    type: string;
                                };
                                schemaArtifacts: {
                                    type: string;
                                };
                            };
                        };
                    };
                };
            };
        };
    };
};
export declare function buildScanRequestBodySchema(builtInRulePackNames: string[]): {
    type: string;
    required: string[];
    properties: {
        openApiDocuments: {
            type: string;
            items: {
                type: string;
                required: string[];
                properties: {
                    source: {
                        type: string;
                    };
                    file: {
                        type: string;
                    };
                    content: {
                        type: string;
                        minLength: number;
                    };
                    format: {
                        type: string;
                        enum: string[];
                    };
                };
            };
        };
        openApiComparisons: {
            type: string;
            items: {
                type: string;
                required: string[];
                properties: {
                    source: {
                        type: string;
                    };
                    file: {
                        type: string;
                    };
                    baseline: {
                        type: string;
                        minLength: number;
                    };
                    current: {
                        type: string;
                        minLength: number;
                    };
                    format: {
                        type: string;
                        enum: string[];
                    };
                };
            };
        };
        schemaDocuments: {
            type: string;
            items: {
                type: string;
                required: string[];
                properties: {
                    source: {
                        type: string;
                    };
                    file: {
                        type: string;
                    };
                    content: {
                        type: string;
                        minLength: number;
                    };
                    format: {
                        type: string;
                        enum: string[];
                    };
                };
            };
        };
        schemaComparisons: {
            type: string;
            items: {
                type: string;
                required: string[];
                properties: {
                    source: {
                        type: string;
                    };
                    file: {
                        type: string;
                    };
                    baseline: {
                        type: string;
                        minLength: number;
                    };
                    current: {
                        type: string;
                        minLength: number;
                    };
                    format: {
                        type: string;
                        enum: string[];
                    };
                };
            };
        };
        contractArtifacts: {
            type: string;
            items: {
                type: string;
                properties: {
                    source: {
                        type: string;
                    };
                    ruleId: {
                        type: string;
                    };
                    severity: {
                        type: string;
                        enum: string[];
                    };
                    message: {
                        type: string;
                    };
                    file: {
                        type: string;
                    };
                    language: {
                        type: string;
                    };
                    line: {
                        type: string;
                    };
                    column: {
                        type: string;
                    };
                    startIndex: {
                        type: string;
                    };
                    endIndex: {
                        type: string;
                    };
                    excerpt: {
                        type: string;
                    };
                    governanceDomain: {
                        anyOf: ({
                            type: string;
                            items?: undefined;
                        } | {
                            type: string;
                            items: {
                                type: string;
                            };
                        })[];
                    };
                    impactHint: {
                        type: string;
                        enum: string[];
                    };
                    range: {
                        type: string;
                        properties: {
                            start: {
                                type: string;
                                properties: {
                                    line: {
                                        type: string;
                                    };
                                    column: {
                                        type: string;
                                    };
                                    index: {
                                        type: string;
                                    };
                                };
                            };
                            end: {
                                type: string;
                                properties: {
                                    line: {
                                        type: string;
                                    };
                                    column: {
                                        type: string;
                                    };
                                    index: {
                                        type: string;
                                    };
                                };
                            };
                        };
                    };
                };
                additionalProperties: boolean;
            };
        };
        schemaArtifacts: {
            type: string;
            items: {
                type: string;
                properties: {
                    source: {
                        type: string;
                    };
                    ruleId: {
                        type: string;
                    };
                    severity: {
                        type: string;
                        enum: string[];
                    };
                    message: {
                        type: string;
                    };
                    file: {
                        type: string;
                    };
                    language: {
                        type: string;
                    };
                    line: {
                        type: string;
                    };
                    column: {
                        type: string;
                    };
                    startIndex: {
                        type: string;
                    };
                    endIndex: {
                        type: string;
                    };
                    excerpt: {
                        type: string;
                    };
                    governanceDomain: {
                        anyOf: ({
                            type: string;
                            items?: undefined;
                        } | {
                            type: string;
                            items: {
                                type: string;
                            };
                        })[];
                    };
                    impactHint: {
                        type: string;
                        enum: string[];
                    };
                    range: {
                        type: string;
                        properties: {
                            start: {
                                type: string;
                                properties: {
                                    line: {
                                        type: string;
                                    };
                                    column: {
                                        type: string;
                                    };
                                    index: {
                                        type: string;
                                    };
                                };
                            };
                            end: {
                                type: string;
                                properties: {
                                    line: {
                                        type: string;
                                    };
                                    column: {
                                        type: string;
                                    };
                                    index: {
                                        type: string;
                                    };
                                };
                            };
                        };
                    };
                };
                additionalProperties: boolean;
            };
        };
        scope: {
            type: string;
            properties: {
                tenant_id: {
                    type: string;
                };
                project_id: {
                    type: string;
                };
                actor_id: {
                    type: string;
                };
                mode: {
                    type: string;
                    enum: string[];
                };
            };
        };
        project: {
            type: string;
            minLength: number;
        };
        rootDir: {
            type: string;
            minLength: number;
        };
        include: {
            type: string;
            items: {
                type: string;
            };
        };
        ignore: {
            type: string;
            items: {
                type: string;
            };
        };
        rules: {
            type: string;
            items: {
                type: string;
            };
        };
        rulePack: {
            type: string;
            enum: string[];
            description: string;
        };
        includeStats: {
            type: string;
        };
        deterministic: {
            type: string;
        };
    };
};
//# sourceMappingURL=scan-schema.d.ts.map