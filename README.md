### Steps
- ``` nvm use``` - to use the right version of npm
- ``` make deps``` - to install dependencies
- ``` make deploy-global-rule``` - to upload the global rule to the organisation you want to
  - The make task requires two variables. The url, and the token. The token can be found by logging into the organisation where you choose to upload the rule.
 
In case you think there is something wrong with the token, go to https://jwt.io/ and paste the token. Check for the username (cognito::username) and the expiry time (iat)
  
