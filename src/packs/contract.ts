import { SkillAxis } from "../profile/model.js";

export interface RepoSignals {
  hasComposerJson: boolean;
  hasPackageJson: boolean;
  hasRequirementsTxt: boolean;
  hasPyprojectToml: boolean;
  composerRequires?: string[];
  packageJsonDeps?: string[];
}

export interface Question {
  id: string;
  axis: SkillAxis;
  difficulty: 0 | 1 | 2 | 3 | 4;
  prompt: string;
  rubric: string;
}

export interface CodemapHeuristic {
  label: string;
  matches: (relativePath: string) => boolean;
  describe: string;
}

export interface AntiPattern {
  id: string;
  description: string;
  detectHint: string;
}

export interface Pack {
  id: string;
  name: string;
  detects: (signals: RepoSignals) => boolean;
  questions: Question[];
  codemapHeuristics: CodemapHeuristic[];
  antiPatterns: AntiPattern[];
}
