export interface ProjectAdapter {
  project: string;
  rootDir: string;
  include: string[];
  ignore: string[];
  ruleGlobs: string[];
}

export declare function listProjects(): string[];
export declare function getProjectAdapter(projectName: string): ProjectAdapter;
