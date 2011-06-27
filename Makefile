
build:
	@@mkdir -p lib
	@@mkdir -p test 
	@@coffee -o lib -c src
	@@coffee -o test -c testsrc
