{{- define "crewlane.name" -}}{{ .Chart.Name }}{{- end -}}

{{- define "crewlane.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}{{ .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else -}}{{ printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}{{- end -}}
{{- end -}}

{{- define "crewlane.labels" -}}
app.kubernetes.io/name: {{ include "crewlane.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "crewlane.selector" -}}
app.kubernetes.io/name: {{ include "crewlane.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "crewlane.image" -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
{{- end -}}

{{- define "crewlane.secretName" -}}
{{- .Values.existingSecret | default (printf "%s-secrets" (include "crewlane.fullname" .)) -}}
{{- end -}}

{{- define "crewlane.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}{{ .Values.serviceAccount.name | default (include "crewlane.fullname" .) }}
{{- else -}}{{ .Values.serviceAccount.name | default "default" }}{{- end -}}
{{- end -}}

{{- define "crewlane.secretEnv" -}}
- name: {{ .name }}
  valueFrom:
    secretKeyRef:
      name: {{ include "crewlane.secretName" .root }}
      key: {{ .name }}
      {{- if .optional }}
      optional: true
      {{- end }}
{{- end -}}
