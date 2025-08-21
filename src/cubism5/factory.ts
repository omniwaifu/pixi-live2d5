import { Cubism5InternalModel } from "@/cubism5/Cubism5InternalModel";
import { Cubism5ModelSettings } from "@/cubism5/Cubism5ModelSettings";
import { cubism5Ready } from "@/cubism5/setup";
import type { Live2DFactoryOptions } from "@/factory/Live2DFactory";
import { Live2DFactory } from "@/factory/Live2DFactory";
import type { CubismSpec } from "@cubism/CubismSpec";
import { CubismPose } from "@cubism/effect/cubismpose";
import { CubismMoc } from "@cubism/model/cubismmoc";
import type { CubismModel } from "@cubism/model/cubismmodel";
import { CubismPhysics } from "@cubism/physics/cubismphysics";

Live2DFactory.registerRuntime({
    version: 5,

    ready: cubism5Ready,

    test(source: any): boolean {
        return source instanceof Cubism5ModelSettings || Cubism5ModelSettings.isValidJSON(source);
    },

    isValidMoc(modelData: ArrayBuffer): boolean {
        if (modelData.byteLength < 4) {
            return false;
        }

        const view = new Int8Array(modelData, 0, 4);

        return String.fromCharCode(...view) === "MOC3";
    },

    createModelSettings(json: object): Cubism5ModelSettings {
        return new Cubism5ModelSettings(json as CubismSpec.ModelJSON & { url: string });
    },

    createCoreModel(data: ArrayBuffer, options?: Live2DFactoryOptions): CubismModel {
        const moc = CubismMoc.create(data, !!options?.checkMocConsistency);

        try {
            const model = moc.createModel();

            // store the moc instance so we can reference it later
            (model as any).__moc = moc;

            return model;
        } catch (e) {
            try {
                moc.release();
            } catch {
                // TODO: handle this error
            }

            throw e;
        }
    },

    createInternalModel(
        coreModel: CubismModel,
        settings: Cubism5ModelSettings,
        options?: Live2DFactoryOptions,
    ): Cubism5InternalModel {
        const model = new Cubism5InternalModel(coreModel, settings, options);

        const coreModelWithMoc = coreModel as { __moc?: CubismMoc };

        if (coreModelWithMoc.__moc) {
            // transfer the moc to InternalModel, because the coreModel will
            // probably have been set to undefined when we receive the "destroy" event
            (model as any).__moc = coreModelWithMoc.__moc;

            delete coreModelWithMoc.__moc;

            // release the moc when destroying
            model.once("destroy", releaseMoc);
        }

        return model;
    },

    createPhysics(coreModel: CubismModel, data: any): CubismPhysics {
        console.log("Creating physics with data type:", typeof data, "data:", data);
        try {
            // Try to use JSON object directly, bypassing ArrayBuffer conversion
            if (typeof data === "object") {
                const jsonString = JSON.stringify(data);
                console.log("Physics JSON string length:", jsonString.length);
                const buffer = new TextEncoder().encode(jsonString);
                console.log("Physics buffer length:", buffer.byteLength);
                return CubismPhysics.create(buffer.buffer, buffer.byteLength);
            }
            return CubismPhysics.create(data);
        } catch (error) {
            console.error("Physics creation error:", error);
            throw error;
        }
    },

    createPose(coreModel: CubismModel, data: any): CubismPose {
        console.log("=== POSE CREATION DEBUG ===");
        console.log("Data type:", typeof data);
        console.log("Data structure:", data);
        console.log("Data keys:", typeof data === "object" ? Object.keys(data) : "N/A");
        
        try {
            if (typeof data === "object") {
                const jsonString = JSON.stringify(data);
                console.log("JSON string preview:", jsonString.substring(0, 200) + "...");
                console.log("JSON string length:", jsonString.length);
                
                const buffer = new TextEncoder().encode(jsonString);
                console.log("ArrayBuffer length:", buffer.byteLength);
                console.log("First 32 bytes:", Array.from(buffer.slice(0, 32)));
                
                const result = CubismPose.create(buffer.buffer, buffer.byteLength);
                console.log("Pose creation result:", result);
                return result;
            }
            return CubismPose.create(data);
        } catch (error) {
            console.error("=== POSE CREATION FAILED ===");
            console.error("Error:", error);
            console.error("Stack:", error.stack);
            throw error;
        }
    },
});

function releaseMoc(this: Cubism5InternalModel) {
    ((this as any).__moc as CubismMoc | undefined)?.release();
}
