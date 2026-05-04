/**
 * Segment and filter types
 */

export type SegmentType = 'DYNAMIC' | 'STATIC';

// Segment filter types
export type SegmentFilterOperator =
  // Standard operators (for contact fields)
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'exists'
  | 'notExists'
  | 'within'
  | 'olderThan' // More than X time ago (for date fields)
  // Event-based operators
  | 'triggered' // Event/email activity occurred (any time)
  | 'triggeredWithin' // Event/email activity occurred within timeframe
  | 'triggeredOlderThan' // Event/email activity occurred more than X time ago
  | 'notTriggered' // Event/email activity never occurred
  | 'notTriggeredWithin'; // Event/email activity has not occurred within timeframe (includes never-triggered)

export type SegmentFilterLogic = 'AND' | 'OR';

export interface SegmentFilter {
  field: string;
  operator: SegmentFilterOperator;
  value?: any;
  unit?: 'days' | 'hours' | 'minutes';
}

export interface FilterGroup {
  filters: SegmentFilter[];
  conditions?: FilterCondition;
}

export interface FilterCondition {
  logic: SegmentFilterLogic;
  groups: FilterGroup[];
}

export interface CreateSegmentData {
  name: string;
  description?: string;
  type?: SegmentType;
  condition?: FilterCondition;
  trackMembership?: boolean;
}

export interface UpdateSegmentData {
  name?: string;
  description?: string;
  type?: SegmentType;
  condition?: FilterCondition;
  trackMembership?: boolean;
}

export interface SegmentMembershipComputeResult {
  added: number;
  removed: number;
  total: number;
}
