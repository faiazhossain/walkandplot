"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { projectRepo } from "@/lib/db/repositories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// PRD 10: building name required, address optional, starting floor name
// optional (default "Ground"). On success the user lands in the project.

const formSchema = z.object({
  name: z.string().trim().min(1, "Give the building a name"),
  description: z.string().trim().optional(),
  firstFloorName: z.string().trim().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function NewProjectForm() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", firstFloorName: "Ground" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const { project } = await projectRepo.create({
        name: values.name,
        description: values.description || undefined,
        firstFloorName: values.firstFloorName || undefined,
      });
      router.push(`/projects/view?id=${project.id}`);
    } catch (err) {
      console.error("Project creation failed", err);
      setSubmitError("The project could not be saved. Check your storage and try again.");
    }
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Building details</CardTitle>
        <CardDescription>Name it, then create your first floor.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="building-name">Building name</Label>
            <Input
              id="building-name"
              placeholder="ABC Shopping Mall"
              autoComplete="off"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="building-address">Address or description (optional)</Label>
            <Input
              id="building-address"
              placeholder="Street, area, city"
              autoComplete="off"
              {...register("description")}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="floor-name">First floor name (optional)</Label>
            <Input
              id="floor-name"
              placeholder="Ground"
              autoComplete="off"
              {...register("firstFloorName")}
            />
            <p className="text-xs text-muted-foreground">
              Any name works - Ground, B1, 2, Mezzanine.
            </p>
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}

          {/* Bottom-anchored primary action (PRD 24) */}
          <Button
            type="submit"
            className="mt-2 h-12 w-full rounded-lg text-base"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Project"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
