/**
 * Build and Serve brand mark: the Geist Semibold ampersand knocked out of a
 * softened square tile. Spec: docs/design/brand/README.md
 *
 * Inlined as a component on purpose. The glyph is cut out of the tile with
 * fill-rule="evenodd" so the ground shows through, which only works while the
 * SVG shares a document with the page. Loaded through <img src> it becomes an
 * isolated document, currentColor resolves to black, and you get a black tile
 * on a black page.
 */
export const BrandMark = (props: React.ComponentProps<"svg">) => {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      role="img"
      aria-label="Build and Serve"
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M0 64A64 64 0 0 1 64 0H448A64 64 0 0 1 512 64V448A64 64 0 0 1 448 512H64A64 64 0 0 1 0 448ZM224.2 402.4C259.4 402.4 288.2 394.4 305 382L316.6 396H377L340.2 352.4C357.4 332.8 369 302 370.6 271.2L318.6 266.4C318.6 287.2 314.6 304 307 314.4L255.4 250C297.4 224.4 316.2 203.6 316.2 171.2C316.2 132.8 288.6 105.6 236.6 105.6C185 105.6 156.2 132.8 156.2 175.6C156.2 200.8 166.6 218.4 185 239.6C142.6 267.2 127 290 127 326C127 375.2 161.8 402.4 224.2 402.4ZM229 356.8C196.6 356.8 181 343.2 181 321.6C181 302 190.2 288 213 272.8L271 344.8C263.4 352 249.4 356.8 229 356.8ZM229 218.4C214.2 201.2 209.4 190.4 209.4 177.2C209.4 161.2 219.4 150.8 237 150.8C253.4 150.8 262.6 160 262.6 175.6C262.6 192.4 253 203.6 229 218.4Z"
      />
    </svg>
  );
};

/** Glyph only, no tile, for dense UI where the block is too loud. */
export const BrandGlyph = (props: React.ComponentProps<"svg">) => {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      role="img"
      aria-label="Build and Serve"
      {...props}
    >
      <path
        fill="currentColor"
        d="M224.2 402.4C259.4 402.4 288.2 394.4 305 382L316.6 396H377L340.2 352.4C357.4 332.8 369 302 370.6 271.2L318.6 266.4C318.6 287.2 314.6 304 307 314.4L255.4 250C297.4 224.4 316.2 203.6 316.2 171.2C316.2 132.8 288.6 105.6 236.6 105.6C185 105.6 156.2 132.8 156.2 175.6C156.2 200.8 166.6 218.4 185 239.6C142.6 267.2 127 290 127 326C127 375.2 161.8 402.4 224.2 402.4ZM229 356.8C196.6 356.8 181 343.2 181 321.6C181 302 190.2 288 213 272.8L271 344.8C263.4 352 249.4 356.8 229 356.8ZM229 218.4C214.2 201.2 209.4 190.4 209.4 177.2C209.4 161.2 219.4 150.8 237 150.8C253.4 150.8 262.6 160 262.6 175.6C262.6 192.4 253 203.6 229 218.4Z"
      />
    </svg>
  );
};
