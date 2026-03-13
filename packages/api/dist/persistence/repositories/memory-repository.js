import { createRepository } from './repository.js';
export const memoryRepository = {
    proposals: createRepository('experimental-memory-proposals'),
    facts: createRepository('experimental-memory-facts'),
    rejections: createRepository('experimental-memory-rejections'),
    lessons: createRepository('experimental-memory-lessons'),
    recipes: createRepository('experimental-memory-recipes'),
};
