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
                    env.BRANCH = sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()
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
                    """
                }
            }
        }

        stage('Run Tests') {
            steps {
                sshagent(['deploy-ssh-key']) {
                    sh """
                        echo "Running tests on staging..."
                        ssh ${DEPLOY_USER}@${STAGING_HOST} "\
                            cd ${APPS_DIR}/${PROJECT_NAME} && \
                            export IMAGE_TAG=${IMAGE_TAG} && \
                            docker compose -f docker-compose.test.yml down --remove-orphans 2>/dev/null || true && \
                            docker compose -f docker-compose.test.yml up \
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
                                docker compose -f docker-compose.test.yml down --remove-orphans" || true
                        """
                    }
                }
            }
        }

        stage('Deploy to Production') {
            when {
                branch 'main'
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
