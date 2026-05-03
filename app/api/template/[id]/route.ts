import { readTemplateStructureFromJson, saveTemplateStructureToJson } from "@/features/playground/libs/path-to-json";
import { db } from "@/lib/db";
import { templatePaths } from "@/lib/template";
import path from "path";
import fs from "fs/promises";
import { NextRequest } from "next/server";

// Helper function to ensure valid JSON
function validateJsonStructure(data: unknown): boolean {
  try {
    JSON.parse(JSON.stringify(data)); // Ensures it's serializable
    return true;
  } catch (error) {
    console.error("Invalid JSON structure:", error);
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const param = await params;
  const id = param.id;

  if (!id) {
    return Response.json({ error: "Missing playground ID" }, { status: 400 });
  }

  const playground = await db.playground.findUnique({
    where: { id },
  });

  if (!playground) {
    return Response.json({ error: "Playground not found" }, { status: 404 });
  }

  const templateKey = playground.template as keyof typeof templatePaths;
  const templatePath = templatePaths[templateKey];

  if (!templatePath) {
    return Response.json({ error: "Invalid template" }, { status: 404 });
  }

  try {
    let inputPath = path.join(process.cwd(), templatePath);
    const outputFile = path.join(process.cwd(), `output/${templateKey}.json`);

    console.log("Input Path:", inputPath);

    // Check if requested template exists, fallback to first available if not
    try {
      const stats = await fs.stat(inputPath);
      if (!stats.isDirectory()) throw new Error();
    } catch {
      console.warn(`Template directory missing: ${templatePath}. Falling back to first available template.`);
      const startersDir = path.join(process.cwd(), "vibecode-starters");
      const entries = await fs.readdir(startersDir, { withFileTypes: true });
      
      let selectedTemplate: string | null = null;
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".")) continue;

        const fullPath = path.join(startersDir, entry.name);
        try {
          const pkgStat = await fs.stat(path.join(fullPath, "package.json"));
          if (pkgStat.isFile()) {
            selectedTemplate = fullPath;
            break;
          }
        } catch (e) {
          // package.json missing, continue searching
          continue;
        }
      }

      if (selectedTemplate) {
        inputPath = selectedTemplate;
        console.log("Fallback Input Path:", inputPath);
      } else {
        throw new Error("No runnable fallback templates available in vibecode-starters");
      }
    }

    console.log("Output Path:", outputFile);

    // Save and read the template structure
    await saveTemplateStructureToJson(inputPath, outputFile);
    const result = await readTemplateStructureFromJson(outputFile);

    // Validate the JSON structure before saving
    if (!validateJsonStructure(result.items)) {
      return Response.json({ error: "Invalid JSON structure" }, { status: 500 });
    }



    await fs.unlink(outputFile);

    return Response.json({ success: true, templateJson: result }, { status: 200 });
  } catch (error) {
    console.error("Error generating template JSON:", error);
    return Response.json({ error: "Failed to generate template" }, { status: 500 });
  }
}


