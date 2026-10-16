# Unique menu imagery

Each of the 110 outlet products has its own locally hosted illustrative photograph, with a distinct URL and distinct file content. The images depict the named drink or dish and are generated illustrations, not photographs of actual outlet servings. Customer-facing menu and accessibility labels identify them as illustrative.

The 18 outlet categories have matching Lucide line icons in the existing brand colours. Category images uploaded by an administrator take precedence over these icons.

The image migrations change only image URL, atlas flag and image position. Item names, prices, availability, dietary labels and order history are preserved.

## Verification

Run `node scripts/verify-menu-images.mjs`. It checks that every menu item has a dedicated local WebP, that all files are present, and that URLs and SHA-256 content hashes are unique. Results are saved to `results.json`. `image-usage.json` maps each image to its menu item.

A mobile viewport check covers card cropping, loaded images, category navigation and item detail images. Type checking, the app build and 58 backend integration tests also run before publication.
