/**
 * Core Routes - P0 核心路由
 * 硬约束 #1: P0 Scope Freeze
 *
 * 这些路由始终启用，提供 los-ast 核心能力:
 * - /scan: 代码扫描
 * - /discover: 符号发现
 */

export { default as scanRoutes } from './scan.js';
export { default as discoverRoutes } from './discover.js';
