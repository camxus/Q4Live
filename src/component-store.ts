/**
 * component-store.ts
 * Persists user-created components to storageDirectory/components.json
 */
import * as fs from "node:fs";
import * as path from "node:path";

export interface QComponent {
  id: string;
  name: string;
  description: string;
  code: string;          // full self-contained HTML of the mini-app
  createdAt: string;     // ISO timestamp
  updatedAt: string;
}

export class ComponentStore {
  private filePath: string | null;
  private components: QComponent[] = [];

  constructor(storageDirectory: string | undefined) {
    this.filePath = storageDirectory
      ? path.join(storageDirectory, "components.json")
      : null;
    this.load();
  }

  list(): QComponent[] {
    return [...this.components];
  }

  get(id: string): QComponent | undefined {
    return this.components.find(c => c.id === id);
  }

  save(component: Omit<QComponent, "id" | "createdAt" | "updatedAt">): QComponent {
    if (component.code.length > 1024 * 1024) {
      throw new Error(`Component code exceeds 1 MB limit (${component.code.length} bytes)`);
    }
    const now = new Date().toISOString();
    const c: QComponent = {
      ...component,
      id:        crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.components.push(c);
    this.persist();
    return c;
  }

  update(id: string, patch: Partial<Pick<QComponent, "name" | "description" | "code">>): QComponent | null {
    const idx = this.components.findIndex(c => c.id === id);
    if (idx < 0) return null;
    this.components[idx] = { ...this.components[idx]!, ...patch, updatedAt: new Date().toISOString() };
    this.persist();
    return this.components[idx]!;
  }

  delete(id: string): boolean {
    const before = this.components.length;
    this.components = this.components.filter(c => c.id !== id);
    if (this.components.length < before) { this.persist(); return true; }
    return false;
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.components, null, 2), "utf8");
    } catch (e) {
      console.error("[Q] ComponentStore write failed:", e);
    }
  }

  private load(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      this.components = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as QComponent[];
    } catch {
      this.components = [];
    }
  }
}
