pipeline {
    agent any

    environment {
        PROJECT_NAME    = 'pipeline-test'
        DOCKER_IMAGE    = "zkracht/${PROJECT_NAME}"
        STAGING_HOST    = credentials('staging-ip')
        PRODUCTION_HOST = credentials('production-ip')
        DEPLOY_USER     = 'deploy'
        APPS_DIR        = '/opt/apps'
    }

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 15, unit: 'MINUTES')
    }

    stages {
        stage('Build Docker Image') {
            steps {
                script {
                    env.IMAGE_TAG = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    // HAG-58: tak uit Jenkins' eigen checkout (GIT_BRANCH), niet uit `git log --format=%D`;
                    // die koos een andere tak als die naar dezelfde commit wees en sloeg prod dan stil over (#37).
                    def rawBranch = env.BRANCH_NAME ?: env.GIT_BRANCH ?: ''
                    if (!rawBranch || rawBranch == 'HEAD') {
                        rawBranch = sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()
                    }
                    env.BRANCH = rawBranch.replaceFirst(/^(refs\/remotes\/)?origin\//, '')
                    if (!env.BRANCH || env.BRANCH == 'HEAD') {
                        error "Tak niet te bepalen (GIT_BRANCH='${env.GIT_BRANCH}'); build gestopt in plaats van prod stil over te slaan"
                    }
                    echo "Building ${DOCKER_IMAGE}:${IMAGE_TAG} (branch: ${BRANCH})"
                    sh "docker build -t ${DOCKER_IMAGE}:${IMAGE_TAG} -t ${DOCKER_IMAGE}:latest ."
                }
            }
        }

        stage('Deploy to Staging') {
            steps {
                sshagent(['deploy-ssh-key']) {
                    sh """
                        echo "Transferring image to staging..."
                        docker save ${DOCKER_IMAGE}:${IMAGE_TAG} | gzip | \
                            ssh ${DEPLOY_USER}@${STAGING_HOST} 'gunzip | docker load'

                        echo "Starting containers on staging..."
                        ssh ${DEPLOY_USER}@${STAGING_HOST} "\
                            cd ${APPS_DIR}/${PROJECT_NAME} && \
                            export IMAGE_TAG=${IMAGE_TAG} && \
                            docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d"
                        # HAG-6/21: pin de gedeployde tag in .env, anders rolt een latere handmatige 'docker compose up -d' stil terug.
                        ssh ${DEPLOY_USER}@${STAGING_HOST} "cd ${APPS_DIR}/${PROJECT_NAME} && if grep -q '^IMAGE_TAG=' .env; then sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=${env.IMAGE_TAG}/' .env; else echo >> .env; echo 'IMAGE_TAG=${env.IMAGE_TAG}' >> .env; fi && chmod 600 .env && grep -qx 'IMAGE_TAG=${env.IMAGE_TAG}' .env && echo '[deploy] .env gepind op IMAGE_TAG=${env.IMAGE_TAG}'"
                    """
                }
            }
        }

        stage('Run Tests') {
            steps {
                sshagent(['deploy-ssh-key']) {
                    sh """
                        # Alleen het testbestand meesturen: de runtime-compose op de hosts heeft tijdzone-
                        # mounts die (nog) niet in git staan, die mogen we hier niet overschrijven.
                        # HAG-49: eigen compose-project (-p ...-test), anders vervangt en verwijdert
                        # de testrun de staging-app (zelfde projectnaam 'pipeline-test').
                        scp docker-compose.test.yml ${DEPLOY_USER}@${STAGING_HOST}:${APPS_DIR}/${PROJECT_NAME}/
                        echo "Running tests on staging..."
                        ssh ${DEPLOY_USER}@${STAGING_HOST} "\
                            cd ${APPS_DIR}/${PROJECT_NAME} && \
                            export IMAGE_TAG=${IMAGE_TAG} && \
                            docker compose -p ${PROJECT_NAME}-test -f docker-compose.test.yml down --remove-orphans 2>/dev/null || true && \
                            docker compose -p ${PROJECT_NAME}-test -f docker-compose.test.yml up \
                                --abort-on-container-exit \
                                --exit-code-from test-runner"
                    """
                }
            }
            post {
                always {
                    sshagent(['deploy-ssh-key']) {
                        sh """
                            ssh ${DEPLOY_USER}@${STAGING_HOST} "\
                                cd ${APPS_DIR}/${PROJECT_NAME} && \
                                docker compose -p ${PROJECT_NAME}-test -f docker-compose.test.yml down --remove-orphans" || true
                        """
                    }
                }
            }
        }

        stage('Deploy to Production') {
            when {
                expression { env.BRANCH == 'main' }
            }
            steps {
                sshagent(['deploy-ssh-key']) {
                    sh """
                        echo "Deploying to production..."
                        docker save ${DOCKER_IMAGE}:${IMAGE_TAG} | gzip | \
                            ssh ${DEPLOY_USER}@${PRODUCTION_HOST} 'gunzip | docker load'

                        ssh ${DEPLOY_USER}@${PRODUCTION_HOST} "\
                            cd ${APPS_DIR}/${PROJECT_NAME} && \
                            export IMAGE_TAG=${IMAGE_TAG} && \
                            docker compose up -d --no-build"

                        ssh ${DEPLOY_USER}@${PRODUCTION_HOST} "\
                            echo '\$(date -u +%Y-%m-%dT%H:%M:%SZ) ${PROJECT_NAME} ${IMAGE_TAG} ${BRANCH}' >> ${APPS_DIR}/deploy.log"

                        echo "Production deploy complete: ${PROJECT_NAME}:${IMAGE_TAG}"
                        # HAG-6/21: pin de gedeployde tag in .env, anders rolt een latere handmatige 'docker compose up -d' stil terug.
                        ssh ${DEPLOY_USER}@${PRODUCTION_HOST} "cd ${APPS_DIR}/${PROJECT_NAME} && if grep -q '^IMAGE_TAG=' .env; then sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=${env.IMAGE_TAG}/' .env; else echo >> .env; echo 'IMAGE_TAG=${env.IMAGE_TAG}' >> .env; fi && chmod 600 .env && grep -qx 'IMAGE_TAG=${env.IMAGE_TAG}' .env && echo '[deploy] .env gepind op IMAGE_TAG=${env.IMAGE_TAG}'"
                    """
                }
            }
        }
    }

    post {
        success {
            echo "Pipeline SUCCESS: ${PROJECT_NAME}:${env.IMAGE_TAG ?: 'unknown'}"
        }
        failure {
            echo "Pipeline FAILED: ${PROJECT_NAME}:${env.IMAGE_TAG ?: 'unknown'}"
        }
        cleanup {
            sh "docker rmi ${DOCKER_IMAGE}:${env.IMAGE_TAG ?: 'unknown'} 2>/dev/null || true"
        }
    }
}
