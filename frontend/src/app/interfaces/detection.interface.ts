export interface Detection {
    bbox: number[];
    class: string;
    confidence: number;
    id: number;
}