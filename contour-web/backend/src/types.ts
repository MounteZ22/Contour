export type FlowStatus = 'in_progress' | 'completed' | 'archived' | 'abandoned';

export interface ProjectDoc {
  id: string;
  title: string;
  type: string;
  content: string;
  summary: string;
}

export interface Claim {
  claimId: string;
  title: string;
  content: string;
  confidence: 'low' | 'medium' | 'high';
  status: 'tentative' | 'active' | 'revised' | 'weakened' | 'superseded' | 'rejected';
  uncertainty: string;
  recommendedWording: string;
}

export interface FlowSection {
  id: string;
  title: string;
  filename: string;
  content: string;
}

export interface Flow {
  flowId: string;
  title: string;
  status: FlowStatus;
  type: string;
  created: string;
  updated: string;
  parentFlows: string[];
  linkedClaims: string[];
  tags: string[];
  openUncertainties: string[];
  summary: string;
  sections: FlowSection[];
  position?: { x: number; y: number };
}

export interface ProjectData {
  projectId: string;
  title: string;
  researchGoal: string;
  currentStage: string;
  docs: ProjectDoc[];
  flows: Flow[];
  claims: Claim[];
}

export interface ContourAppData {
  projects: ProjectData[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
