declare module 'ansi-to-html' {
  interface ConverterOptions {
    fg?: string;
    bg?: string;
    newline?: boolean;
    escapeXML?: boolean;
    stream?: boolean;
    colors?: string[] | { [key: number]: string };
  }

  class Convert {
    constructor(options?: ConverterOptions);
    toHtml(text: string): string;
  }

  export = Convert;
}
