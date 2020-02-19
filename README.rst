ProZorro Auction Frontend
-------------------------

This project is has been composed from
https://github.com/ProzorroUKR/openprocurement.auction.js
and
https://github.com/ProzorroUKR/openprocurement.auction.esco-js
I haven't copied the tests, they are still there


To run container use

    ``docker-compose up``


If you want to run from sources on your host

    1. run ``npm run build``
    2. activate ``- ./build:/app`` volume in docker-compose.yaml


Frontend requires auction api See ``nginx.conf``

You can create a tender using https://github.com/ProzorroUKR/procedure_tools


