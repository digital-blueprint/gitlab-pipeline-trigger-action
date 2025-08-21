# Development

### Build action

You need to run this after you made changes to the action.

```bash
npm run build
```

Then commit the changes to the `dist` folder.

## New release

- `npm ci`
- `npm run build`
- `git commit`
- `git push`
- `git tag v1.0.42`
- `git push --tags`
- `git tag -fa v1 -m "Update v1 tag"`
- `git push --force origin v1`

See [Versioning](https://github.com/actions/toolkit/blob/main/docs/action-versioning.md) for more information.
