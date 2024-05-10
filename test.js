import("color-parse").then(({ default: parse }) => {
   const values = parse("hsl(198deg 93% 60%)");

   console.log(values);
});
