export type ID = string;

export type DeviceKind = 'phone' | 'tablet' | 'desktop';

export interface Screen {
  id: ID;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  device: DeviceKind;
  bg: string;
}

export type ElementType =
  | 'heading'
  | 'text'
  | 'button'
  | 'input'
  | 'textarea'
  | 'checkbox'
  | 'select'
  | 'list'
  | 'table'
  | 'kpi'
  | 'image'
  | 'box'
  | 'divider'
  | 'note';

export interface UIElement {
  id: ID;
  type: ElementType;
  name: string;
  /** The screen the element sits on; null for loose things on the board (sticky notes). */
  screenId: ID | null;
  /** Relative to the screen's top-left corner, or board coordinates when screenId is null. */
  x: number;
  y: number;
  w: number;
  h: number;
  props: Record<string, any>;
}

export type FieldType = 'text' | 'number' | 'bool' | 'date' | 'choice';

export interface FieldDef {
  id: ID;
  name: string;
  type: FieldType;
  options?: string[];
}

export interface TableDef {
  id: ID;
  name: string;
  fields: FieldDef[];
}

export type DataType = 'any' | 'number' | 'text' | 'bool' | 'list' | 'record';

export interface VarDef {
  id: ID;
  name: string;
  type: DataType;
  initial: any;
}

export interface FlowNode {
  id: ID;
  type: string;
  x: number;
  y: number;
  config: Record<string, any>;
}

export interface PortRef {
  node: ID;
  port: string;
}

export interface FlowEdge {
  id: ID;
  from: PortRef;
  to: PortRef;
}

export interface Project {
  format: 'aquist-playground';
  version: 1;
  id: ID;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  screens: Screen[];
  elements: UIElement[];
  startScreenId: ID | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tables: TableDef[];
  variables: VarDef[];
}

/** A row in a table. Values are keyed by field name. */
export type DbRecord = { id: string; [field: string]: any };

export type DbData = Record<ID, DbRecord[]>;

/** What travels in share links and export files. Data is only there when the author opted in. */
export interface ShareBundle {
  project: Project;
  data?: DbData;
}
