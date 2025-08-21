import { ModelSettings } from "@/cubism-common/ModelSettings";
import { applyMixins } from "@/utils";
import type { CubismSpec } from "@cubism/CubismSpec";
import { CubismModelSettingJson } from "@cubism/cubismmodelsettingjson";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Cubism5ModelSettings extends CubismModelSettingJson {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Cubism5ModelSettings extends ModelSettings {
    declare json: CubismSpec.ModelJSON;

    moc!: string;
    textures!: string[];
    hitAreas?: any[];
    motions?: any;
    expressions?: any[];

    static isValidJSON(json: any): json is CubismSpec.ModelJSON {
        return (
            !!json?.FileReferences &&
            typeof json.FileReferences.Moc === "string" &&
            json.FileReferences.Textures?.length > 0 &&
            // textures must be an array of strings
            json.FileReferences.Textures.every((item: any) => typeof item === "string")
        );
    }

    constructor(json: CubismSpec.ModelJSON & { url: string }) {
        super(json);

        if (!Cubism5ModelSettings.isValidJSON(json)) {
            throw new TypeError("Invalid JSON.");
        }

        // Convert JSON object back to ArrayBuffer for Cubism 5 API
        const jsonString = JSON.stringify(json);
        const buffer = new TextEncoder().encode(jsonString);
        Object.assign(this, new CubismModelSettingJson(buffer.buffer, buffer.byteLength));

        // Set up the essential properties from JSON AFTER Object.assign
        // so they don't get overwritten by the Cubism SDK object
        this.moc = json.FileReferences.Moc;
        this.textures = json.FileReferences.Textures;

        // Set optional properties
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

    /**
     * Get all eye blink parameter IDs as an array
     */
    getEyeBlinkParameters() {
        const count = this.getEyeBlinkParameterCount();
        const parameters = [];
        for (let i = 0; i < count; i++) {
            parameters.push(this.getEyeBlinkParameterId(i));
        }
        return parameters;
    }

    /**
     * Get all lip sync parameter IDs as an array
     */
    getLipSyncParameters() {
        const count = this.getLipSyncParameterCount();
        const parameters = [];
        for (let i = 0; i < count; i++) {
            parameters.push(this.getLipSyncParameterId(i));
        }
        return parameters;
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

applyMixins(Cubism5ModelSettings, [CubismModelSettingJson]);
