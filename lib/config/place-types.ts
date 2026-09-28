import type { LucideIcon } from "lucide-react";
import {
  ArrowDownUp,
  ArrowUpDown,
  Briefcase,
  CircleHelp,
  DoorOpen,
  House,
  Package,
  Square,
  Store,
  Toilet,
  UtensilsCrossed,
} from "lucide-react";

// PRD 21: the type catalog is data-driven config. Adding a type is a config
// change + Zod schema, never a feature branch. Nothing here blocks capture;
// details are always answerable later (P2).

export type CaptureKind = "point" | "polygon";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  /** Storage target: feature field name or a props key. */
  key: "name" | "notes" | "access" | "width" | string;
  label: string;
  type: "text" | "number" | "select";
  options?: FieldOption[];
  placeholder?: string;
  inputMode?: "decimal";
}

export interface PlaceType {
  key: string;
  label: string;
  capture: CaptureKind;
  icon: LucideIcon;
  fields: FieldDef[];
}

const ACCESS_FIELD: FieldDef = {
  key: "access",
  label: "Access",
  type: "select",
  options: [
    { value: "public", label: "Public" },
    { value: "staff_only", label: "Staff only" },
    { value: "restricted", label: "Restricted" },
    { value: "emergency_only", label: "Emergency only" },
  ],
};

const DIRECTION_FIELD: FieldDef = {
  key: "direction",
  label: "Direction",
  type: "select",
  options: [
    { value: "up", label: "Up" },
    { value: "down", label: "Down" },
    { value: "both", label: "Both" },
  ],
};

const NOTES_FIELD: FieldDef = {
  key: "notes",
  label: "Notes (optional)",
  type: "text",
  placeholder: "Anything worth remembering",
};

// PRD 21 matrix, one row per type. Field order is the ask order in the sheet.
export const PLACE_TYPES: PlaceType[] = [
  {
    key: "shop",
    label: "Shop",
    capture: "polygon",
    icon: Store,
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "e.g. ABC Fashion" },
      { key: "shopNumber", label: "Shop number (optional)", type: "text", placeholder: "e.g. 304" },
      ACCESS_FIELD,
    ],
  },
  {
    key: "room",
    label: "Room",
    capture: "polygon",
    icon: House,
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "e.g. Meeting Room" },
      ACCESS_FIELD,
    ],
  },
  {
    key: "restaurant",
    label: "Restaurant",
    capture: "polygon",
    icon: UtensilsCrossed,
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "e.g. The Kitchen" },
      ACCESS_FIELD,
    ],
  },
  {
    key: "office",
    label: "Office",
    capture: "polygon",
    icon: Briefcase,
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "e.g. Suite 210" },
      ACCESS_FIELD,
    ],
  },
  {
    key: "storage",
    label: "Storage",
    capture: "polygon",
    icon: Package,
    fields: [
      { key: "name", label: "Name", type: "text", placeholder: "e.g. Stock Room" },
      ACCESS_FIELD,
    ],
  },
  {
    key: "open_area",
    label: "Open Area",
    capture: "polygon",
    icon: Square,
    fields: [NOTES_FIELD],
  },
  {
    key: "toilet",
    label: "Toilet",
    capture: "point",
    icon: Toilet,
    fields: [
      {
        key: "gender",
        label: "Gender",
        type: "select",
        options: [
          { value: "male", label: "Male" },
          { value: "female", label: "Female" },
          { value: "accessible", label: "Accessible" },
          { value: "unisex", label: "Unisex" },
        ],
      },
      ACCESS_FIELD,
    ],
  },
  {
    key: "stairs",
    label: "Stairs",
    capture: "point",
    icon: ArrowUpDown,
    fields: [
      DIRECTION_FIELD,
      {
        key: "accessible",
        label: "Wheelchair accessible",
        type: "select",
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ],
      },
    ],
  },
  {
    key: "lift",
    label: "Lift",
    capture: "point",
    icon: ArrowDownUp,
    fields: [
      {
        key: "kind",
        label: "Kind",
        type: "select",
        options: [
          { value: "passenger", label: "Passenger" },
          { value: "service", label: "Service" },
          { value: "emergency", label: "Emergency" },
          { value: "other", label: "Other" },
        ],
      },
    ],
  },
  {
    key: "entrance",
    label: "Entrance / Exit",
    capture: "point",
    icon: DoorOpen,
    fields: [
      {
        key: "kind",
        label: "Kind",
        type: "select",
        options: [
          { value: "main", label: "Main" },
          { value: "entrance", label: "Entrance" },
          { value: "exit", label: "Exit" },
          { value: "emergency", label: "Emergency" },
          { value: "staff", label: "Staff" },
          { value: "service", label: "Service" },
          { value: "other", label: "Other" },
        ],
      },
    ],
  },
  {
    key: "escalator",
    label: "Escalator",
    capture: "point",
    icon: ArrowDownUp,
    fields: [DIRECTION_FIELD],
  },
  {
    key: "other",
    label: "Other",
    capture: "point",
    icon: CircleHelp,
    fields: [
      { key: "name", label: "Label", type: "text", placeholder: "What is it?" },
      NOTES_FIELD,
    ],
  },
];

// Path subtypes (PRD 15 post-capture chip; PRD 22 paths stay LineString).
export const PATH_SUBTYPES = [
  { value: "corridor", label: "Corridor" },
  { value: "hallway", label: "Hallway" },
  { value: "ramp", label: "Ramp" },
] as const;

export function getPlaceType(key: string): PlaceType | undefined {
  return PLACE_TYPES.find((t) => t.key === key);
}

// PRD 17: retype anytime - offered between types of the same capture kind so
// geometry shape never fights the type.
export function retypableKeys(kind: CaptureKind): string[] {
  return PLACE_TYPES.filter((t) => t.capture === kind).map((t) => t.key);
}

// Export mapping lives with the exporter (Phase 7); for now the catalog also
// feeds canvas labels.
export function typeLabel(key: string): string {
  if (key === "corridor") return "Corridor";
  if (key === "hallway") return "Hallway";
  if (key === "ramp") return "Ramp";
  return getPlaceType(key)?.label ?? key;
}
