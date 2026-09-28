"use client";

import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Link2, Trash2, Unlink } from "lucide-react";
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Feature } from "@/lib/domain/schema";
import {
  getPlaceType,
  PATH_SUBTYPES,
  retypableKeys,
  type FieldDef,
} from "@/lib/config/place-types";
import { PHOTO_QUOTA_MESSAGE, fileToPhotoDataUri } from "@/lib/utils/photo";
import { runSave } from "@/lib/store/save-state";
import { featureRepo, floorRepo } from "@/lib/db/repositories";
import { connectionRepo } from "@/lib/db/connection-repo";
import { connectorRepo, isConnectorSubtype } from "@/lib/db/connector-repo";
import { useHistoryStore } from "@/lib/store/history";

// PRD 16 step 3 / PRD 21: the detail sheet. Never blocks - the place is
// already saved when it appears; Skip just closes it. Opened later from the
// Select tool it edits name, type and conditional fields (PRD 17).
// PRD 34: optional photo, downscaled client-side, quota failures are exact.

interface PlaceDetailSheetProps {
  feature: Feature | null;
  onOpenChange: (open: boolean) => void;
}

export function PlaceDetailSheet({ feature, onOpenChange }: PlaceDetailSheetProps) {
  const open = feature !== null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {feature && <SheetBody feature={feature} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function SheetBody({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const typeDef = getPlaceType(feature.subtype);
  const isPath = feature.type === "path";
  const history = useHistoryStore();

  const [name, setName] = useState(feature.name ?? "");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (typeDef?.fields ?? [])
        .filter((f) => f.key !== "name" && f.key !== "notes" && f.key !== "access")
        .map((f) => [f.key, String(feature.props?.[f.key] ?? "")]),
    ),
  );
  const [notes, setNotes] = useState(feature.notes ?? "");
  const [access, setAccess] = useState(feature.access);
  const [subtype, setSubtype] = useState(feature.subtype);
  const [photo, setPhoto] = useState<string | null>((feature.props?.photo as string) ?? null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-seed whenever a different feature opens.
  const [lastFeatureId, setLastFeatureId] = useState(feature.id);
  if (lastFeatureId !== feature.id) {
    setLastFeatureId(feature.id);
    setName(feature.name ?? "");
    setNotes(feature.notes ?? "");
    setAccess(feature.access);
    setSubtype(feature.subtype);
    setPhoto((feature.props?.photo as string) ?? null);
    setPhotoError(null);
    setFieldValues(
      Object.fromEntries(
        (getPlaceType(feature.subtype)?.fields ?? [])
          .filter((f) => f.key !== "name" && f.key !== "notes" && f.key !== "access")
          .map((f) => [f.key, String(feature.props?.[f.key] ?? "")]),
      ),
    );
  }

  // Fields follow the (possibly retyped) subtype; the connector section
  // owns `direction` for stairs/lift/escalator (PRD 18).
  const isConnector = isConnectorSubtype(subtype);
  const fields = useMemo(
    () =>
      (getPlaceType(subtype)?.fields ?? []).filter((f) => !(isConnector && f.key === "direction")),
    [subtype, isConnector],
  );

  const retypable = isPath
    ? PATH_SUBTYPES.map((s) => ({ value: s.value, label: s.label }))
    : retypableKeys(feature.geometry.type === "Point" ? "point" : "polygon").map((key) => ({
        value: key,
        label: getPlaceType(key)?.label ?? key,
      }));

  async function save() {
    setSaving(true);
    try {
      // Base the patch on the live record: link-managed props (fromFloor,
      // toFloor, direction) may have changed while the sheet was open.
      const live = (await featureRepo.get(feature.id)) ?? feature;
      const props: Record<string, unknown> = { ...(live.props ?? {}) };
      for (const f of fields) {
        if (f.key === "name" || f.key === "notes" || f.key === "access") continue;
        const value = fieldValues[f.key];
        if (value === undefined || value === "") {
          // Connector link fields are managed by the link action, never by
          // an empty form field.
          if (isConnectorSubtype(subtype) && (f.key === "direction" || f.key === "fromFloor" || f.key === "toFloor")) continue;
          delete props[f.key];
        } else {
          props[f.key] = f.type === "number" ? Number(value) : value;
        }
      }
      if (isConnectorSubtype(subtype) && fieldValues["direction"]) {
        props.direction = fieldValues["direction"];
      }
      // PRD 34: photos ride in props; removing clears the key.
      if (photo === null) delete props.photo;
      else props.photo = photo;

      const before = { ...live };
      const patch = {
        name: name.trim() || undefined,
        notes: notes.trim() || undefined,
        access: access as Feature["access"],
        subtype,
        props: Object.keys(props).length ? props : undefined,
      };
      const ok = await runSave(async () => {
        await featureRepo.update(feature.id, patch);
      });
      if (ok) {
        history.push({
          label: "Edit details",
          undo: async () => {
            await featureRepo.update(feature.id, {
              name: before.name,
              notes: before.notes,
              access: before.access,
              subtype: before.subtype,
              props: before.props,
            });
          },
          redo: async () => {
            await featureRepo.update(feature.id, patch);
          },
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handlePhoto(file: File) {
    setPhotoError(null);
    const dataUri = await fileToPhotoDataUri(file);
    if (!dataUri) {
      setPhotoError("That file is not a readable photo.");
      return;
    }
    // Optimistic: show it immediately; a quota failure reverts with the
    // exact message (PRD 34: photo skipped, mapping continues).
    const previous = photo;
    setPhoto(dataUri);
    const ok = await runSave(async () => {
      await featureRepo.update(feature.id, { props: { ...(feature.props ?? {}), photo: dataUri } });
    });
    if (!ok) {
      setPhoto(previous);
      setPhotoError(PHOTO_QUOTA_MESSAGE);
    }
  }

  function handleRemovePhoto() {
    setPhoto(null);
    void runSave(async () => {
      const props = { ...(feature.props ?? {}) };
      delete props.photo;
      await featureRepo.update(feature.id, {
        props: Object.keys(props).length ? props : undefined,
      });
    });
  }

  return (
    <SheetContent>
      <DialogTitle className="font-heading text-base font-semibold">
        {name.trim() || typeDef?.label || subtype} - details
      </DialogTitle>

      <form
        className="flex min-h-0 flex-col gap-4 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {/* Retype (PRD 17: retype anytime) */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="detail-type">Type</Label>
          <div className="flex flex-wrap gap-1.5">
            {retypable.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={subtype === opt.value}
                onClick={() => setSubtype(opt.value)}
                className={`h-9 rounded-full border px-3 text-xs font-semibold ${
                  subtype === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="detail-name">Name</Label>
          <Input
            id="detail-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
            autoComplete="off"
          />
        </div>

        {fields
          .filter((f) => f.key !== "name")
          .map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={
                f.key === "notes" ? notes : f.key === "access" ? access : (fieldValues[f.key] ?? "")
              }
              onChange={(value) => {
                if (f.key === "notes") setNotes(value);
                else if (f.key === "access") setAccess(value as Feature["access"]);
                else setFieldValues((v) => ({ ...v, [f.key]: value }));
              }}
            />
          ))}

        {/* PRD 18: vertical connector - floors and direction */}
        {isConnector && (
          <ConnectorSection
            feature={feature}
            direction={fieldValues["direction"] ?? ""}
            onDirectionChange={(value) => setFieldValues((v) => ({ ...v, direction: value }))}
          />
        )}

        {/* PRD 18: door link confirmation (places; paths are the other end) */}
        {!isConnector && !isPath && <DoorLinkSection feature={feature} />}

        {/* PRD 34: photo (places only) */}
        {!isPath && (
          <div className="flex flex-col gap-2">
            <Label>Photo (optional)</Label>
            {photo ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt="Place photo"
                  className="h-20 w-20 rounded-lg border object-cover"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={handleRemovePhoto}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Remove
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-12 justify-start"
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="size-4" aria-hidden />
                Take or choose a photo
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePhoto(file);
                e.target.value = "";
              }}
            />
            {photoError && (
              <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
                {photoError}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pb-1">
          {/* PRD 16: Skip - the place is saved either way */}
          <Button type="button" variant="ghost" className="h-12 px-6" onClick={onClose}>
            Skip
          </Button>
          <Button type="submit" className="h-12 px-6" disabled={saving}>
            Save Details
          </Button>
        </div>
      </form>
    </SheetContent>
  );
}

// PRD 18: "Connects: Floor 3 -> [choose floor]" with forward declaration.
function ConnectorSection({
  feature,
  direction,
  onDirectionChange,
}: {
  feature: Feature;
  direction: string;
  onDirectionChange: (value: string) => void;
}) {
  const floors = useLiveQuery(
    () => floorRepo.listByProject(feature.projectId),
    [feature.projectId],
  );
  const history = useHistoryStore();
  const [newFloorName, setNewFloorName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestedName = `Floor ${(floors?.length ?? 0) + 1}`;

  const currentFloor = floors?.find((f) => f.id === feature.floorId);
  const linkedTwinQuery = useLiveQuery(
    () => (feature.connectorGroupId ? connectorRepo.findTwin(feature) : Promise.resolve(undefined)),
    [feature.connectorGroupId],
  );
  const twin = feature.connectorGroupId ? linkedTwinQuery : undefined;
  const twinFloor = floors?.find((f) => f.id === twin?.floorId);
  const savedDirection = String(feature.props?.direction ?? "");

  async function link(targetFloorId?: string) {
    setBusy(true);
    setError(null);
    try {
      await connectorRepo.linkFloors({
        feature,
        direction: (direction || savedDirection || "both") as "up" | "down" | "both",
        targetFloorId,
        newFloorName: newFloorName.trim() || suggestedName,
      });
      const targetId = targetFloorId ?? (await connectorRepo.findTwin(feature))?.floorId;
      history.push({
        label: "Link floors",
        undo: async () => {
          const fresh = await featureRepo.get(feature.id);
          if (fresh) await connectorRepo.unlink(fresh);
        },
        redo: async () => {
          const fresh = await featureRepo.get(feature.id);
          if (fresh && targetId)
            await connectorRepo.linkFloors({
              feature: fresh,
              direction: (direction || savedDirection || "both") as "up" | "down" | "both",
              targetFloorId: targetId,
            });
        },
      });
      setCreating(false);
      setNewFloorName("");
    } catch (err) {
      console.error("Linking floors failed", err);
      setError("The floors could not be linked. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!twin) return;
    setBusy(true);
    const targetFloorId = twin.floorId;
    try {
      await connectorRepo.unlink(feature);
      history.push({
        label: "Unlink floors",
        undo: async () => {
          const fresh = await featureRepo.get(feature.id);
          if (fresh)
            await connectorRepo.linkFloors({
              feature: fresh,
              direction: (direction || savedDirection || "both") as "up" | "down" | "both",
              targetFloorId,
            });
        },
        redo: async () => {
          const fresh = await featureRepo.get(feature.id);
          if (fresh) await connectorRepo.unlink(fresh);
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <p className="text-sm font-semibold">Connects floors</p>

      <div className="flex flex-col gap-1.5">
        <Label>Direction</Label>
        <div className="flex flex-wrap gap-1.5">
          {["up", "down", "both"].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={(direction || savedDirection) === d}
              onClick={() => onDirectionChange(d)}
              className={`h-9 rounded-full border px-3 text-xs font-semibold capitalize ${
                (direction || savedDirection) === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {twin && twinFloor ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <Link2 className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">
              {currentFloor?.displayName} - {twinFloor.displayName}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0"
            disabled={busy}
            onClick={() => void unlink()}
          >
            <Unlink className="size-4" aria-hidden />
            Unlink
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label>{currentFloor ? `Connects: ${currentFloor.displayName} ->` : "Connects to"}</Label>
          <div className="flex flex-wrap gap-1.5">
            {(floors ?? [])
              .filter((f) => f.id !== feature.floorId)
              .map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void link(f.id)}
                  className="h-9 rounded-full border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  {f.displayName}
                </button>
              ))}
            {!creating && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setCreating(true)}
                className="h-9 rounded-full border border-primary bg-primary/10 px-3 text-xs font-semibold text-primary disabled:opacity-50"
              >
                + New floor
              </button>
            )}
          </div>
          {creating && (
            <div className="flex items-center gap-2">
              <Input
                value={newFloorName}
                onChange={(e) => setNewFloorName(e.target.value)}
                placeholder={suggestedName}
                autoComplete="off"
                className="h-10"
              />
              <Button
                type="button"
                size="sm"
                className="h-10 shrink-0"
                disabled={busy}
                onClick={() => void link(undefined)}
              >
                Create
              </Button>
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// PRD 18 doors: shown and removable - the connection edge is the record.
function DoorLinkSection({ feature }: { feature: Feature }) {
  const connections = useLiveQuery(() => connectionRepo.listByFeature(feature.id), [feature.id]);
  const linked = (connections ?? []).find((c) => c.kind === "door");
  const otherId = linked
    ? linked.fromFeatureId === feature.id
      ? linked.toFeatureId
      : linked.fromFeatureId
    : null;
  const pathQuery = useLiveQuery(
    () => (otherId ? featureRepo.get(otherId) : Promise.resolve(undefined)),
    [otherId],
  );
  const history = useHistoryStore();

  if (!linked) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border p-3">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">
          Opens onto <span className="font-semibold">{pathQuery?.name ?? "a path"}</span>
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 shrink-0"
        onClick={() => {
          const record = linked;
          void runSave(async () => {
            await connectionRepo.remove(record.id);
          });
          history.push({
            label: "Remove link",
            undo: async () => {
              await connectionRepo.restore(record);
            },
            redo: async () => {
              await connectionRepo.remove(record.id);
            },
          });
        }}
      >
        <Unlink className="size-4" aria-hidden />
        Remove
      </Button>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `detail-${field.key}`;
  if (field.type === "select") {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{field.label}</Label>
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={value === opt.value}
              onClick={() => onChange(value === opt.value ? "" : opt.value)}
              className={`h-9 rounded-full border px-3 text-xs font-semibold ${
                value === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        inputMode={field.inputMode}
        autoComplete="off"
      />
    </div>
  );
}
