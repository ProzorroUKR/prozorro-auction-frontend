.default: update

update:
	npm run build && docker-compose restart frontend
