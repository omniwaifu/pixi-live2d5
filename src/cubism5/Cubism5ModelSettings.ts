import { ModelSettings } from "@/cubism-common/ModelSettings";
import { CubismFramework } from "@cubism/live2dcubismframework";
import type {
    Cubism5ExpressionDefinition,
    Cubism5HitArea,
    Cubism5ModelJSON,
    Cubism5Motions,
} from "./types";

export class Cubism5ModelSettings extends ModelSettings {
    declare json: Cubism5ModelJSON;

    moc!: string;
    textures!: string[];
    layout?: Record<string, number>;
    hitAreas?: Cubism5HitArea[];
    motions?: Cubism5Motions;
    expressions?: Cubism5ExpressionDefinition[];
    userData?: string;

    static isValidJSON(json: unknown): json is Cubism5ModelJSON {
        const maybeSettings = json as Partial<Cubism5ModelJSON> | undefined;
        const fileReferences = maybeSettings?.FileReferences;

        return (
            !!fileReferences &&
            typeof fileReferences.Moc === "string" &&
            Array.isArray(fileReferences.Textures) &&
            fileReferences.Textures.length > 0 &&
            // textures must be an array of strings
            fileReferences.Textures.every((item) => typeof item === "string")
        );
    }

    constructor(json: Cubism5ModelJSON) {
        super(json);

        if (!Cubism5ModelSettings.isValidJSON(json)) {
            throw new TypeError("Invalid JSON.");
        }

        this.moc = json.FileReferences.Moc;
        this.textures = json.FileReferences.Textures;
        this.layout = json.Layout;
        this.userData = json.FileReferences.UserData;

        if (json.FileReferences.Physics) {
            this.physics = json.FileReferences.Physics;
        }
        if (json.FileReferences.Pose) {
            this.pose = json.FileReferences.Pose;
        }

        // Set hitAreas from JSON
        if (json.HitAreas) {
            this.hitAreas = json.HitAreas;
        }

        // Set motions from JSON
        if (json.FileReferences.Motions) {
            this.motions = json.FileReferences.Motions;
        }

        // Set expressions from JSON
        if (json.FileReferences.Expressions) {
            this.expressions = json.FileReferences.Expressions;
        }
    }

    getModelFileName(): string {
        return this.moc;
    }

    getTextureCount(): number {
        return this.textures.length;
    }

    getTextureDirectory(): string {
        const firstTexture = this.textures[0];

        if (!firstTexture?.includes("/")) {
            return "";
        }

        return firstTexture.slice(0, firstTexture.lastIndexOf("/"));
    }

    getTextureFileName(index: number): string {
        return this.textures[index] ?? "";
    }

    getHitAreasCount(): number {
        return this.hitAreas?.length ?? 0;
    }

    getHitAreaId(index: number): any {
        const hitArea = this.hitAreas?.[index];

        return hitArea ? CubismFramework.getIdManager().getId(hitArea.Id) : undefined;
    }

    getHitAreaName(index: number): string {
        return this.hitAreas?.[index]?.Name ?? "";
    }

    getPhysicsFileName(): string {
        return this.physics ?? "";
    }

    getPoseFileName(): string {
        return this.pose ?? "";
    }

    getExpressionCount(): number {
        return this.expressions?.length ?? 0;
    }

    getExpressionName(index: number): string {
        return this.expressions?.[index]?.Name ?? "";
    }

    getExpressionFileName(index: number): string {
        return this.expressions?.[index]?.File ?? "";
    }

    getMotionGroupCount(): number {
        return Object.keys(this.motions ?? {}).length;
    }

    getMotionGroupName(index: number): string {
        return Object.keys(this.motions ?? {})[index] ?? "";
    }

    getMotionCount(groupName: string): number {
        return this.motions?.[groupName]?.length ?? 0;
    }

    getMotionFileName(groupName: string, index: number): string {
        return this.motions?.[groupName]?.[index]?.File ?? "";
    }

    getMotionSoundFileName(groupName: string, index: number): string {
        return this.motions?.[groupName]?.[index]?.Sound ?? "";
    }

    getMotionFadeInTimeValue(groupName: string, index: number): number {
        return this.motions?.[groupName]?.[index]?.FadeInTime ?? -1;
    }

    getMotionFadeOutTimeValue(groupName: string, index: number): number {
        return this.motions?.[groupName]?.[index]?.FadeOutTime ?? -1;
    }

    getUserDataFile(): string {
        return this.userData ?? "";
    }

    getLayoutMap(outLayoutMap: { setValue(key: string, value: number): void }): boolean {
        if (!this.layout) {
            return false;
        }

        Object.entries(this.layout).forEach(([key, value]) => {
            outLayoutMap.setValue(key, value);
        });

        return true;
    }

    private getGroupParameterIds(groupName: string): string[] {
        return this.json.Groups?.find((group) => group.Name === groupName)?.Ids.slice() ?? [];
    }

    getEyeBlinkParameterCount(): number {
        return this.getGroupParameterIds("EyeBlink").length;
    }

    getEyeBlinkParameterId(index: number): any {
        const parameterId = this.getGroupParameterIds("EyeBlink")[index];

        return parameterId ? CubismFramework.getIdManager().getId(parameterId) : undefined;
    }

    /**
     * Get all eye blink parameter IDs as an array
     */
    getEyeBlinkParameters() {
        return this.getGroupParameterIds("EyeBlink");
    }

    getLipSyncParameterCount(): number {
        return this.getGroupParameterIds("LipSync").length;
    }

    getLipSyncParameterId(index: number): any {
        const parameterId = this.getGroupParameterIds("LipSync")[index];

        return parameterId ? CubismFramework.getIdManager().getId(parameterId) : undefined;
    }

    /**
     * Get all lip sync parameter IDs as an array
     */
    getLipSyncParameters() {
        return this.getGroupParameterIds("LipSync");
    }

    replaceFiles(replace: (file: string, path: string) => string) {
        super.replaceFiles(replace);

        if (this.motions) {
            for (const [group, motions] of Object.entries(this.motions)) {
                for (let i = 0; i < motions.length; i++) {
                    motions[i]!.File = replace(motions[i]!.File, `motions.${group}[${i}].File`);

                    if (motions[i]!.Sound !== undefined) {
                        motions[i]!.Sound = replace(
                            motions[i]!.Sound!,
                            `motions.${group}[${i}].Sound`,
                        );
                    }
                }
            }
        }

        if (this.expressions) {
            for (let i = 0; i < this.expressions.length; i++) {
                this.expressions[i]!.File = replace(
                    this.expressions[i]!.File,
                    `expressions[${i}].File`,
                );
            }
        }
    }
}
