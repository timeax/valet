type UpdateThemeOptions = {
   updateKey?: string;
   updateValue?: string;
   prefix?: string;
   newPrefixContent?: string;
   empty?: boolean;
   type: 'root' | 'theme'
};

export function updateThemeBlock(cssContent: string, options: UpdateThemeOptions): string {
   const { updateKey, updateValue, prefix, newPrefixContent, empty = false, type } = options;
   const targetBlock = type === "root" ? ":root" : "@theme";
   const themeRegex = new RegExp(`(${targetBlock})\\s*\\{([\\s\\S]*?)\\}`, "g");

   if (!themeRegex.test(cssContent)) {
      // If the target block does not exist, create it with proper indentation
      return `${cssContent.trim()}\n\n${targetBlock} {\n${updateKey ? `  ${updateKey}: ${updateValue};` : newPrefixContent?.trim() || ''}\n}`;
   }

   return cssContent.replace(themeRegex, (_, blockType, themeContent) => {
      if (empty) return `${blockType} {\n}`;

      let updatedContent = themeContent.trim();
      let keyUpdated = false;
      let prefixFound = false;

      if (updateKey && updateValue) {
         // Match and update an existing key (handles spaces properly)
         const keyRegex = new RegExp(`(^|\\s)(${updateKey.trim()})\\s*:\\s*([^;]+);`, "gm");

         if (keyRegex.test(updatedContent)) {
            updatedContent = updatedContent.replace(keyRegex, `$1$2: ${updateValue};`);
            keyUpdated = true;
         }
      }

      if (prefix) {
         // Remove all keys that start with the given prefix
         const prefixRegex = new RegExp(`\\s*(${prefix}[^:]+)\\s*:\\s*[^;]+;`, "g");

         if (prefixRegex.test(updatedContent)) {
            prefixFound = true;
            updatedContent = updatedContent.replace(prefixRegex, "").trim();
         }
      }

      // Append updateKey if it wasn't found
      if (!keyUpdated && updateKey && updateValue) {
         updatedContent += updatedContent ? `\n  ${updateKey}: ${updateValue};` : `  ${updateKey}: ${updateValue};`;
      }

      // Append newPrefixContent if prefix was cleared or new values need to be added
      if (newPrefixContent) {
         updatedContent += `\n${newPrefixContent.trim().split("\n").map(line => "  " + line).join("\n")}`;
      }

      // Ensure proper formatting & prevent extra newlines
      updatedContent = updatedContent.trim();
      return updatedContent ? `${blockType} {\n  ${updatedContent.replace(/\n+/g, "\n  ")}\n}` : `${blockType} {\n}`;
   });
}



export function replaceThemeBlock(cssContent: string, newThemeBlock: string): string {
   const themeRegex = /@theme\s*\{[\s\S]*?\}/;

   if (themeRegex.test(cssContent)) {
      // Replace existing @theme block
      return cssContent.replace(themeRegex, newThemeBlock.trim());
   } else {
      // Append new @theme block if not found
      return cssContent.trim() + `\n\n${newThemeBlock.trim()}`;
   }
}
