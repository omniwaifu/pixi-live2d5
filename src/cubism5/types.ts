import type { JSONObject } from "../types/helpers";

export interface Cubism5HitArea {
    Id: string;
    Name: string;
}

export interface Cubism5ExpressionDefinition {
    Name: string;
    File: string;
}

export interface Cubism5MotionDefinition {
    File: string;
    Sound?: string;
    FadeInTime?: number;
    FadeOutTime?: number;
}

export type Cubism5Motions = Record<string, Cubism5MotionDefinition[]>;

export interface Cubism5Group {
    Name: string;
    Ids: string[];
}

export interface Cubism5FileReferences {
    Moc: string;
    Textures: string[];
    Expressions?: Cubism5ExpressionDefinition[];
    Motions?: Cubism5Motions;
    Physics?: string;
    Pose?: string;
    UserData?: string;
}

export interface Cubism5ModelJSON extends JSONObject {
    url: string;
    FileReferences: Cubism5FileReferences;
    Groups?: Cubism5Group[];
    HitAreas?: Cubism5HitArea[];
    Layout?: Record<string, number>;
}

export interface Cubism5StartupOptions {
    logFunction?: (...messages: string[]) => void;
    loggingLevel?: number;
}
