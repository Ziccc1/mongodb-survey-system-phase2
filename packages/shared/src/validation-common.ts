// Leaf module: validation primitives must not import the package barrel or domain modules.
export const codePointLength = (text: string) => [...text].length;
export interface DefinitionIssue { code: string; field: string; questionId: string | null; message: string }
