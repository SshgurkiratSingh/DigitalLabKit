#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <mosquitto.h>

#define MQTT_HOST "localhost"
#define MQTT_PORT 1883
#define MQTT_TOPIC "your/topic"

struct mosquitto *mosq = NULL;

void mqtt_callback(struct mosquitto *mosq, void *userdata, const struct mosquitto_message *message)
{
    if(message->payloadlen){
        printf("\a"); // Bell sound
        printf("\nNew message on topic %s: %s\n", message->topic, (char *)message->payload);
        fflush(stdout);
    }
}

void signal_handler(int sig)
{
    switch(sig) {
        case SIGINT:
        case SIGTERM:
            printf("Received signal %d, exiting.\n", sig);
            mosquitto_disconnect(mosq);
            mosquitto_destroy(mosq);
            mosquitto_lib_cleanup();
            exit(0);
            break;
    }
}

int main()
{
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    mosquitto_lib_init();

    mosq = mosquitto_new(NULL, true, NULL);
    if(!mosq){
        fprintf(stderr, "Error: Out of memory.\n");
        exit(EXIT_FAILURE);
    }

    mosquitto_message_callback_set(mosq, mqtt_callback);

    if(mosquitto_connect(mosq, MQTT_HOST, MQTT_PORT, 60)){
        fprintf(stderr, "Unable to connect to MQTT broker.\n");
        exit(EXIT_FAILURE);
    }

    mosquitto_subscribe(mosq, NULL, MQTT_TOPIC, 0);

    printf("Connected to MQTT broker. Listening for messages on topic: %s\n", MQTT_TOPIC);
    printf("Press Ctrl+C to exit.\n");

    mosquitto_loop_forever(mosq, -1, 1);

    mosquitto_destroy(mosq);
    mosquitto_lib_cleanup();

    return 0;
}