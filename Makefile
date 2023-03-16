.PHONY: build push-tag-v1

build:
	npm run build

push-tag-v1:
	git tag -fa v1 -m "Update v1 tag"
	git push origin v1 --force
